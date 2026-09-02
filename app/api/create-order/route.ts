import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

const DEFAULT_EVENT_FALLBACKS: Record<string, { title: string; fee: number }> = {
  'XP EXCHANGE': {
    title: 'GameDev, FreshersTalk, MortalCombat, StumbleGuys & More...',
    fee: 0,
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      eventId,
      userEmail,
      fullName,
      registrationNumber,
      phone = '',
      branch = 'General',
    } = body;

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required to initiate registration.' },
        { status: 400 }
      );
    }

    if (!userEmail || !fullName || !registrationNumber) {
      return NextResponse.json(
        { success: false, error: 'Full name, registration number, and email are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const cleanRegNo = String(registrationNumber).toUpperCase().trim();

    // ── 1. Fetch Authoritative Event Fee & Status from Firestore ──
    let eventTitle = '';
    let actualFee = 0;
    let eventStatus = 'Live';

    // Global registration pause check
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'registration'));
      if (settingsSnap.exists() && settingsSnap.data()?.isOpen === false) {
        return NextResponse.json(
          { success: false, error: 'Tournament registrations are currently paused by arena administrators.' },
          { status: 403 }
        );
      }
    } catch (sErr) {
      console.warn('Settings check fallback:', sErr);
    }

    const eventDocRef = doc(db, 'events', String(eventId));
    const eventDocSnap = await getDoc(eventDocRef);

    if (eventDocSnap.exists()) {
      const eventData = eventDocSnap.data();
      eventTitle = eventData.title || 'IceBreaking Event';
      actualFee = Number(eventData.fee) || 0;
      eventStatus = eventData.status || 'Live';
    } else if (DEFAULT_EVENT_FALLBACKS[eventId]) {
      eventTitle = DEFAULT_EVENT_FALLBACKS[eventId].title;
      actualFee = DEFAULT_EVENT_FALLBACKS[eventId].fee;
    } else {
      return NextResponse.json(
        { success: false, error: 'The requested event was not found in the arena database.' },
        { status: 404 }
      );
    }

    // Event closed check
    if (eventStatus.toLowerCase() === 'closed') {
      return NextResponse.json(
        { success: false, error: 'Registration for this tournament has been closed.' },
        { status: 400 }
      );
    }

    // ── 2. Validate Amount ──
    if (actualFee <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'This event is free of charge and does not require online checkout.',
          isFree: true,
        },
        { status: 400 }
      );
    }

    // ── 3. Seat Capacity Check (Max 80 seats per event) ──
    const allEventRegsQuery = query(
      collection(db, 'event_registrations'),
      where('event_id', '==', String(eventId))
    );
    const allRegsSnap = await getDocs(allEventRegsQuery);
    const SEAT_LIMIT = 80;

    if (allRegsSnap.size >= SEAT_LIMIT) {
      return NextResponse.json(
        { success: false, error: 'This tournament is now completely full (seat capacity reached).' },
        { status: 400 }
      );
    }

    // ── 4. Idempotency Guard: Check for Existing Paid Registration ──
    const alreadyPaid = allRegsSnap.docs.some((d) => {
      const data = d.data();
      const emailMatch = (data.user_email || '').toLowerCase() === cleanEmail;
      const regMatch = (data.registration_number || '').toUpperCase() === cleanRegNo;
      return (emailMatch || regMatch) && (data.payment_status === 'Paid' || data.payment_status === 'Free');
    });

    if (alreadyPaid) {
      return NextResponse.json(
        { success: false, error: 'You have already completed registration for this tournament.' },
        { status: 400 }
      );
    }

    // ── 5. Active Order Reuse Check (Prevent order flooding within 10 min window) ──
    const activePaymentQuery = query(
      collection(db, 'payments'),
      where('event_id', '==', String(eventId)),
      where('user_email', '==', cleanEmail),
      where('status', '==', 'Processing')
    );
    const activePaymentSnap = await getDocs(activePaymentQuery);
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    for (const pDoc of activePaymentSnap.docs) {
      const pData = pDoc.data();
      const createdMs = pData.created_at?.toDate ? pData.created_at.toDate().getTime() : 0;
      if (pData.razorpay_order_id && createdMs > tenMinutesAgo) {
        const keyId = (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').trim();
        return NextResponse.json({
          success: true,
          order_id: pData.razorpay_order_id,
          amount: Math.round(actualFee * 100),
          currency: pData.currency || 'INR',
          key_id: keyId,
          payment_id: pDoc.id,
          reused: true,
        });
      }
    }

    // ── 4. Verify Razorpay Server Credentials ──
    const keyId = (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

    if (!keyId || !keySecret) {
      console.error('Razorpay credentials missing from server environment.');
      return NextResponse.json(
        {
          success: false,
          error: 'Payment gateway credentials are not configured on the server. Please contact support.',
        },
        { status: 500 }
      );
    }

    // ── 5. Create Payment Record in Firestore with Pending Status ──
    const paymentDocRef = await addDoc(collection(db, 'payments'), {
      event_id: String(eventId),
      event_title: eventTitle,
      user_email: cleanEmail,
      candidate_name: String(fullName).trim(),
      registration_number: cleanRegNo,
      phone: String(phone).trim(),
      branch: String(branch).trim(),
      amount: actualFee,
      currency: 'INR',
      status: 'Pending',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      source: 'icebreaking-arena',
    });

    // ── 6. Create Razorpay Order via Secret Key ──
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const amountInPaise = Math.round(actualFee * 100);
    const safeReceipt = `rcpt_${paymentDocRef.id.slice(0, 30)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: safeReceipt,
      notes: {
        paymentId: paymentDocRef.id,
        eventId: String(eventId),
        eventTitle: eventTitle.slice(0, 40),
        userEmail: cleanEmail,
        registrationNumber: cleanRegNo,
      },
    });

    // ── 7. Update Payment Record to Processing Status ──
    await updateDoc(paymentDocRef, {
      razorpay_order_id: order.id,
      status: 'Processing',
      updated_at: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      payment_id: paymentDocRef.id,
    });
  } catch (error: any) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error?.error?.description ||
          error?.description ||
          error?.message ||
          'Failed to initialize Razorpay checkout session.',
      },
      { status: 500 }
    );
  }
}
