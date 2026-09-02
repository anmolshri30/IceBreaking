import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { PaymentItem, RazorpaySuccessResponse } from '@/types/payment';

export const PAYMENTS_COLLECTION = 'payments';

/**
 * Dynamically loads the official Razorpay Checkout SDK.
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export interface CheckoutParams {
  eventId: string;
  eventTitle: string;
  userEmail: string;
  fullName: string;
  registrationNumber: string;
  phone?: string;
  branch?: string;
  onSuccess?: (response: RazorpaySuccessResponse, paymentId: string) => void;
  onDismiss?: (paymentId?: string) => void;
  onError?: (errorMessage: string) => void;
  onProcessing?: (paymentId: string) => void;
}

/**
 * Orchestrates the secure Razorpay Checkout process:
 * 1. Server validates event & creates Razorpay Order via /api/create-order
 * 2. Razorpay Checkout modal is opened with customized Cyberpunk Arena theme
 * 3. On successful payment, details are forwarded to /api/verify-payment
 * 4. Server verifies HMAC-SHA256 signature and confirms event registration
 */
export async function initiateRazorpayCheckout({
  eventId,
  eventTitle,
  userEmail,
  fullName,
  registrationNumber,
  phone = '',
  branch = '',
  onSuccess,
  onDismiss,
  onError,
  onProcessing,
}: CheckoutParams) {
  try {
    const isLoaded = await loadRazorpayScript();
    if (!isLoaded) {
      onError?.('Failed to load Razorpay payment gateway. Please check your internet connection.');
      return;
    }

    // Step 1: Create Order on Server
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        userEmail,
        fullName,
        registrationNumber,
        phone,
        branch,
      }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok || !orderData.success) {
      onError?.(orderData.error || 'Failed to initialize payment order.');
      return;
    }

    const { order_id, amount, currency, key_id, payment_id } = orderData;
    onProcessing?.(payment_id);

    // Step 2: Configure Razorpay Checkout Options
    const options = {
      key: key_id,
      amount,
      currency: currency || 'INR',
      name: 'VRGC IceBreaking Arena',
      description: eventTitle || 'Tournament Pass Registration',
      order_id,
      image: '/logo.png',
      prefill: {
        name: fullName,
        email: userEmail,
        contact: phone,
      },
      theme: {
        color: '#8b5cf6', // Violet Neon
        backdrop_color: '#05070e',
      },
      modal: {
        ondismiss: () => {
          onDismiss?.(payment_id);
        },
      },
      handler: async (response: RazorpaySuccessResponse) => {
        try {
          // Step 3: Server Verification
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              payment_id,
              eventId,
              eventTitle,
              userEmail,
              fullName,
              registrationNumber,
              phone,
              branch,
            }),
          });

          const verifyData = await verifyRes.json();

          if (verifyRes.ok && verifyData.success) {
            onSuccess?.(response, payment_id);
          } else {
            onError?.(verifyData.error || 'Payment signature verification failed.');
          }
        } catch (vErr: any) {
          onError?.(vErr?.message || 'Failed to complete payment verification.');
        }
      },
    };

    const razorpayInstance = new (window as any).Razorpay(options);
    razorpayInstance.on('payment.failed', (failResponse: any) => {
      console.warn('Payment failed on client:', failResponse?.error);
      onError?.(failResponse?.error?.description || 'Payment was declined by bank or gateway.');
    });

    razorpayInstance.open();
  } catch (err: any) {
    console.error('Payment checkout error:', err);
    onError?.(err?.message || 'An unexpected error occurred during payment.');
  }
}

/**
 * Fetch payment records for a specific user from Firestore.
 */
export async function fetchUserPayments(userEmail: string): Promise<PaymentItem[]> {
  try {
    if (!userEmail) return [];
    const cleanEmail = userEmail.toLowerCase().trim();
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('user_email', '==', cleanEmail)
    );
    const snap = await getDocs(q);
    const list: PaymentItem[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        event_id: data.event_id || '',
        event_title: data.event_title || '',
        user_email: data.user_email || '',
        candidate_name: data.candidate_name || '',
        registration_number: data.registration_number || '',
        phone: data.phone || '',
        branch: data.branch || '',
        amount: Number(data.amount) || 0,
        currency: data.currency || 'INR',
        status: data.status || 'Pending',
        razorpay_order_id: data.razorpay_order_id || '',
        razorpay_payment_id: data.razorpay_payment_id || '',
        razorpay_signature: data.razorpay_signature || '',
        payment_method: data.payment_method || '',
        error_description: data.error_description || '',
        paid_at: data.paid_at || '',
        failed_at: data.failed_at || '',
        created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : data.created_at || '',
        updated_at: data.updated_at?.toDate ? data.updated_at.toDate().toISOString() : data.updated_at || '',
      });
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error('Failed to fetch user payments:', err);
    return [];
  }
}

/**
 * Reconciles payment status against Razorpay API.
 */
export async function syncPaymentStatus(paymentId: string) {
  try {
    const res = await fetch('/api/check-payment-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    return await res.json();
  } catch (err) {
    console.warn('Sync payment status warning:', err);
    return { success: false };
  }
}
