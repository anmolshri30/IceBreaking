import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    // 1. Mandatory Webhook Signature Verification
    if (!signature || !webhookSecret) {
      console.warn('Razorpay Webhook rejected: Missing x-razorpay-signature header or webhook secret.');
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Webhook signature and secret are required.' },
        { status: 401 }
      );
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    const isValidSignature =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!isValidSignature) {
      console.warn('Razorpay Webhook signature mismatch.');
      return NextResponse.json({ success: false, error: 'Invalid webhook signature.' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const orderEntity = payload.payload?.order?.entity || {};

      const razorpayPaymentId = paymentEntity.id || '';
      const razorpayOrderId = paymentEntity.order_id || orderEntity.id || '';
      const targetPaymentId = paymentEntity.notes?.paymentId || '';
      const email = (paymentEntity.email || paymentEntity.notes?.userEmail || '').toLowerCase().trim();

      const paymentsCol = collection(db, 'payments');
      const allDocsSnap = await getDocs(paymentsCol);

      for (const pDoc of allDocsSnap.docs) {
        const pData = pDoc.data();
        if (pData.status === 'Paid') continue;

        const docId = pDoc.id;
        const docEmail = (pData.user_email || '').toLowerCase().trim();
        const docOrderId = (pData.razorpay_order_id || '').trim();

        let isMatch = false;
        if (targetPaymentId && targetPaymentId === docId) isMatch = true;
        if (docOrderId && razorpayOrderId && docOrderId === razorpayOrderId) isMatch = true;
        if (docEmail && email && docEmail === email) isMatch = true;

        if (isMatch) {
          const paidAtTime = paymentEntity.created_at
            ? new Date(paymentEntity.created_at * 1000).toISOString()
            : new Date().toISOString();

          await updateDoc(pDoc.ref, {
            status: 'Paid',
            razorpay_order_id: razorpayOrderId || docOrderId,
            razorpay_payment_id: razorpayPaymentId,
            payment_method: paymentEntity.method ? `Razorpay (${String(paymentEntity.method).toUpperCase()})` : 'Razorpay Online',
            paid_at: paidAtTime,
            updated_at: serverTimestamp(),
            error_description: '',
          });

          // Confirm registration in event_registrations
          const regQuery = query(
            collection(db, 'event_registrations'),
            where('event_id', '==', String(pData.event_id)),
            where('user_email', '==', docEmail)
          );
          const regSnap = await getDocs(regQuery);

          if (!regSnap.empty) {
            await updateDoc(regSnap.docs[0].ref, {
              payment_status: 'Paid',
              payment_id: docId,
              razorpay_payment_id: razorpayPaymentId,
              razorpay_order_id: razorpayOrderId,
              updated_at: serverTimestamp(),
            });
          } else {
            await addDoc(collection(db, 'event_registrations'), {
              event_id: String(pData.event_id),
              event_title: pData.event_title || 'IceBreaking Tournament',
              user_email: docEmail,
              full_name: pData.candidate_name || 'Tournament Player',
              registration_number: pData.registration_number || '',
              phone: pData.phone || '',
              branch: pData.branch || 'General',
              payment_status: 'Paid',
              payment_id: docId,
              razorpay_payment_id: razorpayPaymentId,
              razorpay_order_id: razorpayOrderId,
              registered_at: serverTimestamp(),
              is_present: false,
            });
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Razorpay Webhook Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Webhook handler error' },
      { status: 500 }
    );
  }
}
