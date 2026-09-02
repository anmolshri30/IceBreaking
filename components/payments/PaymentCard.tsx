"use client";

import React, { useState } from "react";
import { AuroraText } from "@/components/ui/aurora-text";
import {
  ShieldCheck,
  Zap,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  User,
  CreditCard,
  X,
  ExternalLink,
  Printer,
  Download,
  FileText,
  Ticket,
} from "lucide-react";
import confetti from "canvas-confetti";

export type PaymentCardState = "ready" | "processing" | "success" | "failed" | "cancelled";

export interface PaymentCardProps {
  eventId: string;
  eventTitle: string;
  category?: string;
  amount: number;
  currency?: string;
  fullName: string;
  registrationNumber: string;
  userEmail: string;
  phone?: string;
  branch?: string;
  onProceedToPay: () => Promise<void> | void;
  onClose?: () => void;
  onSuccessDone?: () => void;
  initialState?: PaymentCardState;
  errorMessage?: string | null;
  paymentId?: string | null;
  orderId?: string | null;
  razorpayPaymentId?: string | null;
}

export default function PaymentCard({
  eventId,
  eventTitle,
  category = "Event Registration",
  amount,
  currency = "INR",
  fullName,
  registrationNumber,
  userEmail,
  phone,
  branch,
  onProceedToPay,
  onClose,
  onSuccessDone,
  initialState = "ready",
  errorMessage = null,
  paymentId = null,
  orderId = null,
  razorpayPaymentId = null,
}: PaymentCardProps) {
  const [state, setState] = useState<PaymentCardState>(initialState);
  const [localError, setLocalError] = useState<string | null>(errorMessage);
  const [isViewingReceipt, setIsViewingReceipt] = useState<boolean>(false);

  const fireSuccessCelebration = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#8b5cf6", "#a855f7", "#ec4899", "#06b6d4", "#10b981"],
        zIndex: 99999,
      });
      setTimeout(() => {
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { y: 0.5 },
          colors: ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"],
          zIndex: 99999,
        });
      }, 250);
    } catch {
      // Confetti fallback
    }
  };

  const handlePrintReceipt = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handlePayClick = async () => {
    setState("processing");
    setLocalError(null);
    try {
      await onProceedToPay();
    } catch (err: any) {
      setLocalError(err?.message || "Failed to initiate payment session.");
      setState("failed");
    }
  };

  // Sync state if props change
  React.useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);

  React.useEffect(() => {
    if (errorMessage) setLocalError(errorMessage);
  }, [errorMessage]);

  React.useEffect(() => {
    if (state === "success") {
      fireSuccessCelebration();
    }
  }, [state]);

  return (
    <div className="relative w-full max-w-md mx-auto select-none font-sans text-slate-100">
      {/* Outer Glow Halo */}
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 rounded-[2.25rem] blur-xl opacity-40 group-hover:opacity-60 transition duration-1000 -z-10" />

      {/* Main Glass Card */}
      <div className="relative rounded-[2rem] bg-[#0a0d18]/95 border border-violet-500/35 overflow-hidden backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.3)] transition-all">
        {/* Cyberpunk Top Neon Strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

        {/* Close Button if applicable */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}

        {/* ── STATE: READY TO ENTER ── */}
        {state === "ready" && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Header / Event Title */}
            <div className="space-y-1.5 pr-6">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.2)] flex items-center gap-1.5">
                  <Zap size={11} className="text-violet-400" />
                  <span>{category}</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                  ● READY TO ENTER
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                {eventTitle}
              </h2>
            </div>

            {/* Player Information Box */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <User size={13} className="text-violet-400" />
                  Player Name
                </span>
                <span className="font-bold text-white truncate max-w-[180px]">{fullName}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Registration No.</span>
                <span className="font-mono font-bold text-violet-300">{registrationNumber}</span>
              </div>

              {userEmail && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Student Email</span>
                  <span className="text-slate-300 font-mono text-[11px] truncate max-w-[180px]">
                    {userEmail}
                  </span>
                </div>
              )}
            </div>

            {/* Fee Section with Large Typography */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-950/40 via-[#0d1226] to-[#0a0d18] border border-violet-500/30 flex items-center justify-between shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-0.5">
                  TOURNAMENT ENTRY FEE
                </span>
                <span className="text-xs text-violet-300 font-medium">One-time event pass</span>
              </div>
              <div className="text-right">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight flex items-center justify-end">
                  <span className="text-violet-400 text-2xl mr-0.5">₹</span>
                  <span>{amount}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  {currency} • INCL. TAXES
                </span>
              </div>
            </div>

            {/* Proceed to Payment Action Button */}
            <div className="space-y-3 pt-1">
              <button
                onClick={handlePayClick}
                className="group relative w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-black text-sm shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:shadow-[0_0_45px_rgba(139,92,246,0.7)] transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <span>PROCEED TO PAYMENT</span>
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1.5 transition-transform duration-200"
                />
              </button>

              {/* Security Pill */}
              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>SECURE PAYMENT • POWERED BY</span>
                <span className="font-bold text-white tracking-wider">RAZORPAY</span>
              </div>
            </div>
          </div>
        )}

        {/* ── STATE: PROCESSING ── */}
        {state === "processing" && (
          <div className="p-8 sm:p-10 text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-lg animate-pulse" />
              <div className="w-20 h-20 rounded-full border-2 border-violet-500/30 border-t-violet-400 flex items-center justify-center animate-spin mx-auto">
                <CreditCard className="w-8 h-8 text-violet-300 animate-pulse" />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 flex items-center justify-center gap-1.5">
                <Sparkles size={13} className="animate-spin" style={{ animationDuration: "3s" }} />
                <span>CONNECTING GATEWAY</span>
              </span>
              <h3 className="text-2xl font-black text-white">PROCESSING PAYMENT</h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                Please complete transaction in the Razorpay window. Please keep this screen open while we verify your confirmation.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-[11px] font-mono text-violet-300 flex items-center justify-center gap-2">
              <Loader2 size={13} className="animate-spin" />
              <span>Awaiting server cryptographic verification…</span>
            </div>
          </div>
        )}

        {/* ── STATE: SUCCESS ── */}
        {state === "success" && (
          <div className="p-6 sm:p-8 space-y-5 animate-in zoom-in-95 duration-300">
            {!isViewingReceipt ? (
              <div className="text-center space-y-6">
                <div className="w-18 h-18 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.35)] animate-bounce">
                  <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
                    ✦ PAYMENT VERIFIED ✦
                  </span>
                  <div className="text-3xl sm:text-4xl font-black text-white font-mono">
                    ₹{amount} <span className="text-lg font-bold text-emerald-300">PAID</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white">{eventTitle}</h3>
                  <p className="text-xs text-slate-300 font-medium">
                    REGISTRATION CONFIRMED • SEAT RESERVED
                  </p>
                </div>

                {/* Summary Box */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Player</span>
                    <span className="text-white font-bold">{fullName}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Reg Number</span>
                    <span className="text-violet-300">{registrationNumber}</span>
                  </div>
                  {razorpayPaymentId && (
                    <div className="flex justify-between text-slate-400 truncate">
                      <span>Txn ID</span>
                      <span className="text-emerald-400 truncate max-w-[170px]">{razorpayPaymentId}</span>
                    </div>
                  )}
                  {orderId && (
                    <div className="flex justify-between text-slate-400 truncate">
                      <span>Order ID</span>
                      <span className="text-slate-300 truncate max-w-[170px]">{orderId}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons: View Receipt + Done */}
                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    onClick={() => setIsViewingReceipt(true)}
                    className="flex-1 py-3 px-4 rounded-xl border border-violet-500/40 hover:bg-violet-500/15 text-violet-300 hover:text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                  >
                    <FileText size={14} />
                    <span>View Receipt</span>
                  </button>
                  <button
                    onClick={onSuccessDone || onClose}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <span>Done</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              /* Digital Receipt / Tournament Ticket View */
              <div className="space-y-4 text-left animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-violet-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-white">
                      Official Tournament Pass &amp; Receipt
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    VERIFIED
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono bg-black/40 border border-white/10 rounded-2xl p-4">
                  <div className="flex justify-between items-start pb-2 border-b border-white/5">
                    <span className="text-slate-400">Event / Pass</span>
                    <span className="font-bold text-white text-right max-w-[200px]">{eventTitle}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Amount Paid</span>
                    <span className="text-emerald-400 font-black text-sm">₹{amount} {currency}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Player</span>
                    <span className="text-white font-semibold">{fullName}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Reg No.</span>
                    <span className="text-violet-300 font-bold">{registrationNumber}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Email</span>
                    <span className="text-slate-300 text-[10px] truncate max-w-[180px]">{userEmail}</span>
                  </div>

                  {razorpayPaymentId && (
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                      <span className="text-slate-400">Txn ID</span>
                      <span className="text-emerald-400 text-[10px] truncate max-w-[170px]">{razorpayPaymentId}</span>
                    </div>
                  )}

                  {orderId && (
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                      <span className="text-slate-400">Order ID</span>
                      <span className="text-slate-400 text-[10px] truncate max-w-[170px]">{orderId}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 text-[10px] text-slate-500">
                    <span>Date &amp; Time</span>
                    <span>
                      {new Date().toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={handlePrintReceipt}
                    className="flex-1 py-3 px-4 rounded-xl border border-white/15 hover:bg-white/10 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer size={14} />
                    <span>Print / PDF</span>
                  </button>
                  <button
                    onClick={() => setIsViewingReceipt(false)}
                    className="flex-1 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                  >
                    <span>Back</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STATE: FAILED ── */}
        {state === "failed" && (
          <div className="p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(244,63,94,0.35)]">
              <AlertTriangle className="w-10 h-10 text-rose-400" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                ✦ TRANSACTION UNVERIFIED ✦
              </span>
              <h3 className="text-2xl font-black text-white">PAYMENT FAILED</h3>
              <p className="text-xs text-rose-300/90 max-w-xs mx-auto leading-relaxed">
                {localError || "Your payment could not be completed or signature verification was unsuccessful. Your seat has not been confirmed."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              )}
              <button
                onClick={handlePayClick}
                className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-extrabold shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>RE-ATTEMPT PAYMENT</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STATE: CANCELLED ── */}
        {state === "cancelled" && (
          <div className="p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
                ✦ CHECKOUT DISMISSED ✦
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-white">PAYMENT CANCELLED</h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                The payment window was closed before completion. You can try again whenever you&apos;re ready.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Back to Events
                </button>
              )}
              <button
                onClick={handlePayClick}
                className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>RETRY PAYMENT</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
