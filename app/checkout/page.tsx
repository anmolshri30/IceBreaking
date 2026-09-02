"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { VideoBackground } from "@/components/ui/VideoBackground";
import PaymentCard, { PaymentCardState } from "@/components/payments/PaymentCard";
import { initiateRazorpayCheckout } from "@/lib/payments";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const eventId = searchParams.get("eventId") || "XP EXCHANGE";
  const paramFullName = searchParams.get("fullName") || "";
  const paramRegNo = searchParams.get("regNo") || "";

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<{ title: string; fee: number; category: string } | null>(null);

  const [cardState, setCardState] = useState<PaymentCardState>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(null);

  const [fullName, setFullName] = useState(paramFullName);
  const [regNo, setRegNo] = useState(paramRegNo);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user?.displayName && !paramFullName) {
        setFullName(user.displayName);
      }
      setLoading(false);
    });

    // Check localStorage for student details
    if (typeof window !== "undefined") {
      const storedReg = localStorage.getItem("ib_reg_number");
      const storedName = localStorage.getItem("ib_full_name");
      if (storedReg && !paramRegNo) setRegNo(storedReg);
      if (storedName && !paramFullName) setFullName(storedName);
    }

    return () => unsub();
  }, [paramFullName, paramRegNo]);

  // Load Event Details
  useEffect(() => {
    async function loadEvent() {
      try {
        const docRef = doc(db, "events", eventId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setEventData({
            title: data.title || "Glitch Fest Tournament",
            fee: Number(data.fee) || 0,
            category: data.category || "Tournament Pass",
          });
        } else {
          setEventData({
            title: "Glitch Fest Tournament Pass",
            fee: 149,
            category: "Cyberpunk Showcase",
          });
        }
      } catch {
        setEventData({
          title: "Glitch Fest Tournament Pass",
          fee: 149,
          category: "Cyberpunk Showcase",
        });
      }
    }
    loadEvent();
  }, [eventId]);

  const handleProceedToPay = async () => {
    if (!eventData) return;

    setCardState("processing");
    setErrorMessage(null);

    const targetEmail = currentUser?.email || `${(regNo || "student").toLowerCase()}@vitbhopal.ac.in`;

    await initiateRazorpayCheckout({
      eventId,
      eventTitle: eventData.title,
      userEmail: targetEmail,
      fullName: fullName || "Arena Contestant",
      registrationNumber: regNo || "25BCY10000",
      phone: "",
      branch: "CSE",
      onSuccess: (response) => {
        setConfirmedOrderId(response.razorpay_order_id);
        setConfirmedPaymentId(response.razorpay_payment_id);
        setCardState("success");
      },
      onDismiss: () => {
        setCardState("cancelled");
      },
      onError: (msg) => {
        setErrorMessage(msg);
        setCardState("failed");
      },
      onProcessing: () => {
        setCardState("processing");
      },
    });
  };

  if (loading || !eventData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        <span className="text-xs text-violet-300 font-mono tracking-widest uppercase">
          Initializing Arena Gateway…
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/event-register"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-violet-300 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Tournaments</span>
        </Link>
        <span className="text-[10px] font-mono uppercase tracking-widest text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
          ✦ CYBERPUNK AURORA ARENA
        </span>
      </div>

      <PaymentCard
        eventId={eventId}
        eventTitle={eventData.title}
        category={eventData.category}
        amount={eventData.fee}
        currency="INR"
        fullName={fullName || "Arena Player"}
        registrationNumber={regNo || "25BCY10000"}
        userEmail={currentUser?.email || `${(regNo || "player").toLowerCase()}@vitbhopal.ac.in`}
        initialState={cardState}
        errorMessage={errorMessage}
        orderId={confirmedOrderId}
        razorpayPaymentId={confirmedPaymentId}
        onProceedToPay={handleProceedToPay}
        onClose={() => router.push("/event-register")}
        onSuccessDone={() => router.push("/event-register")}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-slate-100 overflow-x-hidden">
      <VideoBackground />
      <PublicNavbar />
      <main className="relative z-10 flex-1 pt-24 pb-16">
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          }
        >
          <CheckoutContent />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
