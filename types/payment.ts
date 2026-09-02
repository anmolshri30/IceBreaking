export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Cancelled' | 'Processing';

export interface PaymentItem {
  id: string;
  event_id: string;
  event_title: string;
  user_email: string;
  candidate_name?: string;
  registration_number?: string;
  phone?: string;
  branch?: string;
  amount: number; // in INR
  currency: string;
  status: PaymentStatus;
  due_date?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  payment_method?: string;
  error_description?: string;
  paid_at?: string;
  failed_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface CreateOrderRequest {
  eventId: string;
  userEmail: string;
  fullName: string;
  registrationNumber: string;
  phone?: string;
  branch?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order_id?: string;
  amount?: number;
  currency?: string;
  key_id?: string;
  payment_id?: string;
  error?: string;
}

export interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  payment_id: string;
  eventId?: string;
  eventTitle?: string;
  userEmail?: string;
  fullName?: string;
  registrationNumber?: string;
  phone?: string;
  branch?: string;
  paymentMethod?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  message?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  error?: string;
}
