import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { paymentId, orderId } = body;

    if (!paymentId && !orderId) {
      return NextResponse.json(
        { success: false, error: 'paymentId or orderId is required to verify status.' },
        { status: 400 }
      );
    }

    const keyId = (process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay API credentials not configured.' },
        { status: 500 }
      );
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    // 1. Locate payment document
    let paymentDocRef: any = null;
    let paymentData: any = null;

    if (paymentId) {
      paymentDocRef = doc(db, 'payments', String(paymentId));
      const pSnap = await getDoc(paymentDocRef);
      if (pSnap.exists()) {
        paymentData = pSnap.data();
      }
    }

    if (!paymentData && orderId) {
      const q = query(collection(db, 'payments'), where('razorpay_order_id', '==', String(orderId)));
      const snap = await getDocs(q);
      if (!snap.empty) {
        paymentDocRef = snap.docs[0].ref;
        paymentData = snap.docs[0].data();
      }
    }

    if (!paymentData) {
      return NextResponse.json(
        { success: false, error: 'Payment document not found.' },
        { status: 404 }
      );
    }

    // If already marked as Paid, return confirmation
    if (paymentData.status === 'Paid') {
      return NextResponse.json({
        success: true,
        status: 'Paid',
        payment_id: paymentDocRef.id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_order_id: paymentData.razorpay_order_id,
      });
    }

    const targetOrderId = orderId || paymentData.razorpay_order_id;
    if (!targetOrderId) {
      return NextResponse.json({
        success: true,
        status: paymentData.status || 'Pending',
      });
    }

    // 2. Fetch payments for this order from Razorpay
    const orderPayments = await razorpay.orders.fetchPayments(targetOrderId);
    const capturedTx = (orderPayments?.items || []).find(
      (p: any) => p.status === 'captured' || p.status === 'authorized'
    );

    if (capturedTx) {
      const paidIso = capturedTx.created_at
        ? new Date(capturedTx.created_at * 1000).toISOString()
        : new Date().toISOString();

      await updateDoc(paymentDocRef, {
        status: 'Paid',
        razorpay_payment_id: capturedTx.id,
        razorpay_order_id: targetOrderId,
        payment_method: capturedTx.method ? `Razorpay (${String(capturedTx.method).toUpperCase()})` : 'Razorpay Online',
        paid_at: paidIso,
        updated_at: serverTimestamp(),
        error_description: '',
      });

      // Also confirm registration in event_registrations
      const regQuery = query(
        collection(db, 'event_registrations'),
        where('event_id', '==', String(paymentData.event_id)),
        where('user_email', '==', String(paymentData.user_email))
      );
      const regSnap = await getDocs(regQuery);

      if (!regSnap.empty) {
        await updateDoc(regSnap.docs[0].ref, {
          payment_status: 'Paid',
          payment_id: paymentDocRef.id,
          razorpay_payment_id: capturedTx.id,
          razorpay_order_id: targetOrderId,
          updated_at: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'event_registrations'), {
          event_id: String(paymentData.event_id),
          event_title: paymentData.event_title || 'IceBreaking Tournament',
          user_email: String(paymentData.user_email),
          full_name: paymentData.candidate_name || 'Tournament Player',
          registration_number: paymentData.registration_number || '',
          phone: paymentData.phone || '',
          branch: paymentData.branch || 'General',
          payment_status: 'Paid',
          payment_id: paymentDocRef.id,
          razorpay_payment_id: capturedTx.id,
          razorpay_order_id: targetOrderId,
          registered_at: serverTimestamp(),
          is_present: false,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'Paid',
        updated: true,
        razorpay_payment_id: capturedTx.id,
        razorpay_order_id: targetOrderId,
      });
    }

    return NextResponse.json({
      success: true,
      status: paymentData.status || 'Processing',
      updated: false,
    });
  } catch (err: any) {
    console.error('Error checking payment status:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
