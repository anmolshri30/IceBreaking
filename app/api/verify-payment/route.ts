import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

async function logPaymentAttempt(paymentId: string, details: Record<string, any>) {
  try {
    if (!paymentId) return;
    const attemptsCol = collection(db, 'payments', paymentId, 'attempts');
    await addDoc(attemptsCol, {
      ...details,
      timestamp: serverTimestamp(),
      created_at: new Date().toISOString(),
      source: 'icebreaking-verification',
    });
  } catch (err) {
    console.warn('Failed to log payment attempt in Firestore subcollection:', err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_id,
      eventId,
      eventTitle,
      userEmail,
      fullName,
      registrationNumber,
      phone = '',
      branch = '',
      paymentMethod = 'Razorpay Online',
    } = body;

    // ── 1. Validate Required Payload ──
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !payment_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required Razorpay verification credentials (order ID, payment ID, or signature).',
        },
        { status: 400 }
      );
    }

    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    const keyId = (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').trim();

    if (!keySecret) {
      console.error('RAZORPAY_KEY_SECRET missing from server environment.');
      return NextResponse.json(
        { success: false, error: 'Payment gateway secret not configured on the server.' },
        { status: 500 }
      );
    }

    // ── 2. Fetch Payment Record from Firestore ──
    const paymentDocRef = doc(db, 'payments', String(payment_id));
    const paymentDocSnap = await getDoc(paymentDocRef);

    if (!paymentDocSnap.exists()) {
      return NextResponse.json(
        { success: false, error: 'Associated payment record could not be found in the database.' },
        { status: 404 }
      );
    }

    const paymentData = paymentDocSnap.data();

    // ── 3. Idempotency Check: Already Verified? ──
    if (paymentData.status === 'Paid') {
      return NextResponse.json({
        success: true,
        message: 'Payment has already been verified and processed.',
        razorpay_payment_id: paymentData.razorpay_payment_id || razorpay_payment_id,
        razorpay_order_id: paymentData.razorpay_order_id || razorpay_order_id,
        payment_id,
      });
    }

    // ── 4. Order ID Mismatch Check ──
    if (paymentData.razorpay_order_id && paymentData.razorpay_order_id !== razorpay_order_id) {
      return NextResponse.json(
        { success: false, error: 'Razorpay order ID mismatch with stored registration record.' },
        { status: 400 }
      );
    }

    // ── 5. Cryptographic Signature Verification (HMAC-SHA256 Constant-Time) ──
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(razorpay_signature, 'utf8');

    const isValidSignature =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!isValidSignature) {
      console.warn(`Razorpay Signature Mismatch for Payment ${payment_id}`);

      const nowIso = new Date().toISOString();
      await updateDoc(paymentDocRef, {
        status: 'Failed',
        failed_at: nowIso,
        razorpay_order_id,
        razorpay_payment_id,
        error_description: 'Payment signature verification failed (HMAC-SHA256 mismatch)',
        updated_at: serverTimestamp(),
      });

      await logPaymentAttempt(payment_id, {
        status: 'Failed',
        user_email: paymentData.user_email || userEmail,
        razorpay_order_id,
        razorpay_payment_id,
        error_description: 'HMAC signature mismatch',
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Security signature mismatch. Payment verification failed.',
        },
        { status: 400 }
      );
    }

    // ── 6. Secondary Server Verification with Razorpay API (Double Check Amount) ──
    if (keyId && keySecret) {
      try {
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const fetchedOrder = await razorpay.orders.fetch(razorpay_order_id);
        const expectedPaise = Math.round(Number(paymentData.amount) * 100);

        if (fetchedOrder && fetchedOrder.amount && fetchedOrder.amount !== expectedPaise) {
          return NextResponse.json(
            { success: false, error: 'Paid Razorpay order amount does not match event fee.' },
            { status: 400 }
          );
        }
      } catch (err) {
        console.warn('Razorpay order fetch warning during verification:', err);
      }
    }

    // ── 7. Signature Validated -> Update Payment Document to Paid ──
    const paidIso = new Date().toISOString();
    await updateDoc(paymentDocRef, {
      status: 'Paid',
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_method: paymentMethod,
      paid_at: paidIso,
      updated_at: serverTimestamp(),
      error_description: '',
    });

    // ── 8. Confirm Tournament Registration in `event_registrations` ──
    const targetEventId = paymentData.event_id || eventId;
    const targetEmail = (paymentData.user_email || userEmail || '').toLowerCase().trim();
    const targetRegNo = (paymentData.registration_number || registrationNumber || '').toUpperCase().trim();
    const targetFullName = paymentData.candidate_name || fullName || 'Tournament Player';
    const targetTitle = paymentData.event_title || eventTitle || 'IceBreaking Tournament';
    const targetPhone = paymentData.phone || phone || '';
    const targetBranch = paymentData.branch || branch || 'General';

    const existingRegQuery = query(
      collection(db, 'event_registrations'),
      where('event_id', '==', String(targetEventId)),
      where('user_email', '==', targetEmail)
    );
    const existingRegSnap = await getDocs(existingRegQuery);

    if (!existingRegSnap.empty) {
      // Update existing record
      const regDoc = existingRegSnap.docs[0];
      await updateDoc(regDoc.ref, {
        payment_status: 'Paid',
        payment_id: payment_id,
        razorpay_payment_id,
        razorpay_order_id,
        updated_at: serverTimestamp(),
      });
    } else {
      // Create new verified registration document
      await addDoc(collection(db, 'event_registrations'), {
        event_id: String(targetEventId),
        event_title: targetTitle,
        user_email: targetEmail,
        full_name: targetFullName,
        registration_number: targetRegNo,
        phone: targetPhone,
        branch: targetBranch,
        payment_status: 'Paid',
        payment_id: payment_id,
        razorpay_payment_id,
        razorpay_order_id,
        registered_at: serverTimestamp(),
        is_present: false,
      });
    }

    // ── 9. Log Success Attempt ──
    await logPaymentAttempt(payment_id, {
      status: 'Paid',
      user_email: targetEmail,
      candidate_name: targetFullName,
      registration_number: targetRegNo,
      razorpay_order_id,
      razorpay_payment_id,
      payment_method: paymentMethod,
      paid_at: paidIso,
    });

    return NextResponse.json({
      success: true,
      message: 'Payment verified and tournament seat confirmed successfully! ✦',
      razorpay_payment_id,
      razorpay_order_id,
      payment_id,
    });
  } catch (error: any) {
    console.error('Error in payment verification:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal server error while verifying payment signature.',
      },
      { status: 500 }
    );
  }
}
