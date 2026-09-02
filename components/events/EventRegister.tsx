"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import {
  collection,
  addDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { EventItem } from "@/types/event-register";
import { AuroraText } from "@/components/ui/aurora-text";
import {
  Calendar,
  CalendarX,
  MapPin,
  CheckCircle2,
  XCircle,
  Search,
  Sparkles,
  Tag,
  Loader2,
  X,
  ArrowRight,
  Clock,
  Zap,
  LogIn,
  Lock,
  CreditCard,
} from "lucide-react";
import PaymentCard, { PaymentCardState } from "@/components/payments/PaymentCard";
import { initiateRazorpayCheckout } from "@/lib/payments";

const SEAT_LIMIT = 80;

interface EventRegisterProps {
  onRedirect?: () => void;
  externalUser?: any;
  externalUserEmail?: string;
}

const DEFAULT_EVENTS: EventItem[] = [
  {
    id: "XP EXCHANGE",
    title: "GameDev, FreshersTalk, MortalCombat, StumbleGuys & More...",
    category: "Freshers Welcome",
    date: "August 20, 2026",
    location: "GAMING LAB, LC-005",
    fee: 0,
    originalFee: 99,
    description: "Join the ultimate VR & Gaming showdown and live esports tournament at VIT Bhopal!",
    status: "Live",
  },
];

export default function EventRegister({
  externalUser,
  externalUserEmail,
}: EventRegisterProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(externalUser || null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState<boolean>(true);

  // Monitor Registration Settings & Firebase auth state
  useEffect(() => {
    const unsubReg = onSnapshot(doc(db, "settings", "registration"), (docSnap) => {
      if (docSnap.exists()) {
        setIsRegistrationOpen(Boolean(docSnap.data()?.isOpen));
      } else {
        setIsRegistrationOpen(true);
      }
    });

    if (externalUser !== undefined) {
      setCurrentUser(externalUser);
      setIsAuthChecking(false);
      return () => unsubReg();
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });

    return () => {
      unsubReg();
      unsubAuth();
    };
  }, [externalUser]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.warn("Sign in error:", err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const currentEmail = (
    externalUserEmail ||
    currentUser?.email ||
    (typeof window !== "undefined" ? localStorage.getItem("ib_reg_number") : "") ||
    ""
  ).toLowerCase();

  const [events, setEvents] = useState<EventItem[]>(DEFAULT_EVENTS);
  const [loading, setLoading] = useState<boolean>(true);
  const [registeringEvent, setRegisteringEvent] = useState<EventItem | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<Record<string, boolean>>({});
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [isSubmittingReg, setIsSubmittingReg] = useState<boolean>(false);

  // Search & Category Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // Seat counter state
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});

  // Form inputs for user registration
  const [fullName, setFullName] = useState<string>("");
  const [regNo, setRegNo] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [branch, setBranch] = useState<string>("");

  // Payment portal state
  const [isPaymentStep, setIsPaymentStep] = useState<boolean>(false);
  const [paymentCardState, setPaymentCardState] = useState<PaymentCardState>("ready");
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.displayName && !fullName) {
      setFullName(currentUser.displayName);
    }
  }, [currentUser, fullName]);

  // Extract reg number from local storage or email if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedReg = localStorage.getItem("ib_reg_number");
      const storedName = localStorage.getItem("ib_full_name");
      if (storedReg && !regNo) setRegNo(storedReg.toUpperCase());
      if (storedName && !fullName) setFullName(storedName);
    }
    if (currentEmail) {
      const match = currentEmail.match(/\b\d{2}[a-zA-Z]{3}\d{5}\b/);
      if (match && !regNo) {
        setRegNo(match[0].toUpperCase());
      }
    }
  }, [currentEmail, regNo, fullName]);

  // Real-time listener: watch 'events' collection
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(
      collection(db, "events"),
      (snap) => {
        if (!snap.empty) {
          const list: EventItem[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              title: data.title || "",
              category: data.category || "Event",
              date: data.date || "",
              location: data.location || data.venue || "",
              fee: Number(data.fee) || 0,
              originalFee: data.originalFee !== undefined ? Number(data.originalFee) : undefined,
              description: data.description || "",
              status: data.status || "Upcoming",
            });
          });
          setEvents(list);
        } else {
          setEvents(DEFAULT_EVENTS);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Events real-time listener fallback:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // Real-time listener: watch all event_registrations
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "event_registrations"), (snap) => {
      const counts: Record<string, number> = {};
      const userRegs: Record<string, boolean> = {};
      snap.forEach((d) => {
        const data = d.data();
        const eid = data.event_id as string;
        if (!eid) return;
        counts[eid] = (counts[eid] || 0) + 1;
        if (
          (currentEmail && data.user_email === currentEmail) ||
          (regNo && data.registration_number === regNo.toUpperCase())
        ) {
          userRegs[eid] = true;
        }
      });
      setRegistrationCounts(counts);
      setRegisteredEvents(userRegs);
    });
    return () => unsub();
  }, [currentUser, currentEmail, regNo]);

  // User: Open Registration Modal
  const handleOpenRegistrationModal = (evt: EventItem) => {
    setRegisteringEvent(evt);
    setIsPaymentStep(false);
    setPaymentCardState("ready");
    setPaymentErrorMessage(null);
    setConfirmedOrderId(null);
    setConfirmedPaymentId(null);
    if (!fullName && currentUser?.displayName) {
      setFullName(currentUser.displayName);
    }
  };

  // User: Confirm Registration Form
  const handleConfirmRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registeringEvent || !currentUser) return;

    const targetEmail = currentEmail || currentUser.email || `${regNo.toLowerCase()}@vitbhopal.ac.in`;
    const targetRegNo = regNo.trim().toUpperCase();

    if (!targetRegNo || !fullName.trim() || !phone.trim()) {
      alert("Please fill in all required fields (Name, Registration Number, Phone).");
      return;
    }

    const currentCount = registrationCounts[registeringEvent.id] || 0;
    if (currentCount >= SEAT_LIMIT) {
      alert("Sorry, this event is now full. Registration is closed.");
      setRegisteringEvent(null);
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("ib_reg_number", targetRegNo);
      localStorage.setItem("ib_full_name", fullName.trim());
    }

    // If event has a fee, transition to Cyberpunk Aurora Arena Payment Step
    if (registeringEvent.fee > 0) {
      setIsPaymentStep(true);
      setPaymentCardState("ready");
      setPaymentErrorMessage(null);
      return;
    }

    // Free Event Registration (Instant, no gateway)
    setIsSubmittingReg(true);
    try {
      await addDoc(collection(db, "event_registrations"), {
        event_id: registeringEvent.id,
        event_title: registeringEvent.title,
        user_email: targetEmail,
        full_name: fullName.trim(),
        registration_number: targetRegNo,
        phone: phone.trim(),
        branch: branch.trim() || "General",
        registered_at: serverTimestamp(),
        payment_status: "Free",
        is_present: false,
      });

      setRegisterSuccess(`Successfully registered for ${registeringEvent.title}! See you at the arena!`);
      setRegisteringEvent(null);
    } catch (err: any) {
      console.error("Registration failed:", err);
      alert("Registration failed. Please try again.");
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // User: Execute Razorpay Checkout
  const handleProceedToPay = async () => {
    if (!registeringEvent || !currentUser) return;
    const targetEmail = currentEmail || currentUser.email || `${regNo.toLowerCase()}@vitbhopal.ac.in`;
    const targetRegNo = regNo.trim().toUpperCase();

    setPaymentCardState("processing");
    setPaymentErrorMessage(null);

    await initiateRazorpayCheckout({
      eventId: registeringEvent.id,
      eventTitle: registeringEvent.title,
      userEmail: targetEmail,
      fullName: fullName.trim(),
      registrationNumber: targetRegNo,
      phone: phone.trim(),
      branch: branch.trim() || "General",
      onSuccess: (response) => {
        setConfirmedOrderId(response.razorpay_order_id);
        setConfirmedPaymentId(response.razorpay_payment_id);
        setPaymentCardState("success");
        setRegisteredEvents((prev) => ({ ...prev, [registeringEvent.id]: true }));
      },
      onDismiss: () => {
        setPaymentCardState("cancelled");
      },
      onError: (msg) => {
        setPaymentErrorMessage(msg);
        setPaymentCardState("failed");
      },
      onProcessing: () => {
        setPaymentCardState("processing");
      },
    });
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        evt.title.toLowerCase().includes(q) ||
        evt.description.toLowerCase().includes(q) ||
        evt.location.toLowerCase().includes(q) ||
        evt.category.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (categoryFilter === "All") return true;
      return evt.category.toLowerCase().includes(categoryFilter.toLowerCase());
    });
  }, [events, searchQuery, categoryFilter]);

  // Analytics Metrics
  const totalEventsCount = events.length;
  const liveEventsCount = events.filter((e) => (e.status as string)?.toLowerCase() === "live").length;
  const totalRegistrations = Object.values(registrationCounts).reduce((a, b) => a + b, 0);
  const totalSeatsRemaining = Math.max(0, totalEventsCount * SEAT_LIMIT - totalRegistrations);

  // Categories list
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return ["All", ...Array.from(set)];
  }, [events]);

  // ── Authentication Gate ──
  if (isAuthChecking) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        <span className="text-xs text-violet-300 font-mono tracking-widest uppercase">
          Verifying Authentication…
        </span>
      </div>
    );
  }

  // Not logged in: Show Login Gate (Only accessible after login)
  if (!currentUser) {
    return (
      <div className="p-4 sm:p-6 md:p-10 max-w-xl mx-auto w-full my-12 text-slate-100 select-none animate-in fade-in duration-300">
        <div className="p-8 sm:p-10 rounded-3xl bg-[#0a0d18]/90 border border-violet-500/35 relative overflow-hidden backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.3)] text-center space-y-6">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

          <div className="w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <Lock className="w-8 h-8 text-violet-400" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-300">
              ✦ TOURNAMENT ARENA ACCESS
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Sign In to View <AuroraText>Tournaments</AuroraText>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Official VRGC tournament registrations and seat reservations are accessible only after logging in with your student Google account.
            </p>
          </div>

          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-extrabold text-xs shadow-[0_0_25px_rgba(139,92,246,0.5)] transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                <span>Signing In…</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // When registrations are closed: show "No Current Events"
  if (!isRegistrationOpen) {
    return (
      <div className="p-4 sm:p-6 md:p-10 max-w-2xl mx-auto w-full my-12 text-slate-100 select-none animate-in fade-in duration-300">
        <div className="p-10 rounded-3xl bg-[#0a0d18]/90 border border-violet-500/30 relative overflow-hidden backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(139,92,246,0.2)] text-center space-y-6">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(244,63,94,0.3)]">
            <CalendarX className="w-8 h-8 text-rose-400" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-300">
              ✦ REGISTRATIONS CURRENTLY PAUSED
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              No Current <AuroraText>Events</AuroraText>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
              There are currently no active tournament registrations open. New esports showcases and VR events will be announced soon.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <Link
              href="/event"
              className="py-3 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all flex items-center gap-2"
            >
              <span>Go to Event Hub →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-300 text-slate-100 select-none">
      {/* Header Banner — Clean Participant View */}
      <div className="p-7 md:p-10 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/30 relative overflow-hidden backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_40px_rgba(124,58,237,0.15)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all duration-300">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="space-y-2.5 relative z-10">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
              <Sparkles size={13} className="text-violet-400 animate-spin" style={{ animationDuration: "6s" }} />
              <span>✦ AVAILABLE EVENTS &amp; TOURNAMENTS</span>
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight flex items-center gap-3">
            Arena <AuroraText>Registration</AuroraText>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Welcome to the VRGC Registration Portal! Choose an event below to reserve your seat. Open to all VIT Bhopal students.
          </p>
        </div>
      </div>

      {/* KPI Stat Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
          <span className="text-[10px] font-extrabold text-violet-300 tracking-wider uppercase block mb-1">
            ACTIVE TOURNAMENTS
          </span>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">{liveEventsCount}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Live registrations open</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
          <span className="text-[10px] font-extrabold text-emerald-300 tracking-wider uppercase block mb-1">
            TOTAL REGISTRATIONS
          </span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{totalRegistrations}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Students secured seats</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
          <span className="text-[10px] font-extrabold text-amber-300 tracking-wider uppercase block mb-1">
            TOTAL SEATS LEFT
          </span>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{totalSeatsRemaining}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Capacity across events</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
          <span className="text-[10px] font-extrabold text-indigo-300 tracking-wider uppercase block mb-1">
            ARENA CATEGORIES
          </span>
          <div className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">{categoriesList.length - 1}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Esports, VR &amp; Workshops</span>
        </div>
      </div>

      {/* Search & Category Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search events by title, category, or location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-white/[0.04] border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 active:scale-95 shrink-0 cursor-pointer ${
                categoryFilter === cat
                  ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Success Notification */}
      {registerSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between gap-3 shadow-[0_0_25px_rgba(16,185,129,0.25)] backdrop-blur-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>{registerSuccess}</span>
          </div>
          <button onClick={() => setRegisterSuccess(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Events Grid — Clean Participant Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-3xl bg-white/5 border border-white/10 animate-pulse backdrop-blur-xl" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#0a0d18]/80 border border-violet-500/20 text-center space-y-3 backdrop-blur-2xl shadow-xl">
          <Calendar className="w-12 h-12 mx-auto text-violet-400/40" />
          <h3 className="text-xl font-bold text-white">No Events Match Your Filter</h3>
          <p className="text-xs text-slate-400">Try changing your search term or selecting &quot;All&quot; categories.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredEvents.map((evt) => {
            const isRegistered = registeredEvents[evt.id];
            const count = registrationCounts[evt.id] || 0;
            const seatsLeft = Math.max(0, SEAT_LIMIT - count);
            const isFull = seatsLeft === 0;
            const fillPct = Math.min(100, (count / SEAT_LIMIT) * 100);

            const hasOffer = evt.originalFee && evt.originalFee > evt.fee;
            const savings = hasOffer ? evt.originalFee! - evt.fee : 0;
            const discountPct = hasOffer ? Math.round((savings / evt.originalFee!) * 100) : 0;

            const statusStr = (evt.status as string)?.toLowerCase();
            const isEventClosed = statusStr === "closed" || statusStr === "upcoming";

            return (
              <div
                key={evt.id}
                className="group relative bg-[#0a0d18]/85 border border-violet-500/25 hover:border-violet-400/60 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_45px_rgba(0,0,0,0.6),0_0_30px_rgba(124,58,237,0.12)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(139,92,246,0.3)] transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between gap-6 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                      {evt.category}
                    </span>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                      {hasOffer && (
                        <span className="text-xs text-slate-400/90 font-mono line-through font-semibold">
                          ₹{evt.originalFee}
                        </span>
                      )}
                      <span className="text-xs font-black text-emerald-300 font-mono tracking-tight flex items-center gap-1">
                        <Tag size={12} className="text-emerald-400" />
                        {evt.fee === 0 ? "FREE ENTRY" : `₹${evt.fee}`}
                      </span>
                      {hasOffer && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.35)] animate-pulse">
                          {discountPct}% OFF
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-violet-300 transition-colors duration-200 leading-snug">
                      {evt.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed whitespace-pre-line">
                      {evt.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Calendar size={14} className="text-violet-400" />
                      <span className="font-mono">{evt.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300 truncate">
                      <MapPin size={14} className="text-violet-400 shrink-0" />
                      <span className="truncate">{evt.location}</span>
                    </div>
                  </div>

                  {/* ── Seat Counter & Telemetry ── */}
                  <div className="space-y-2.5">
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          isFull
                            ? "bg-rose-500 shadow-[0_0_10px_#f43f5e]"
                            : fillPct > 75
                            ? "bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_10px_#f59e0b]"
                            : "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_10px_#8b5cf6]"
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>

                    {/* Counter pill */}
                    {isFull ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[10px] font-extrabold uppercase tracking-wide">
                        <XCircle size={12} />
                        Registration Closed — Full
                      </div>
                    ) : isEventClosed ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] font-extrabold uppercase tracking-wide">
                        <Lock size={12} />
                        Registration Closed
                      </div>
                    ) : (
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide ${
                          seatsLeft <= 10
                            ? "bg-rose-500/15 border border-rose-500/40 text-rose-300 animate-pulse"
                            : "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                        }`}
                      >
                        <Clock size={12} />
                        ⚡ {seatsLeft} seats left — Hurry!
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    ● Status: {evt.status}
                  </span>

                  {isRegistered ? (
                    <button
                      disabled
                      className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center gap-2 cursor-default shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    >
                      <CheckCircle2 size={16} />
                      <span>Registered</span>
                    </button>
                  ) : isEventClosed ? (
                    <button
                      disabled
                      className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2 cursor-not-allowed"
                    >
                      <Lock size={15} />
                      <span>Registration Closed</span>
                    </button>
                  ) : isFull ? (
                    <button
                      disabled
                      className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2 cursor-not-allowed"
                    >
                      <Lock size={15} />
                      <span>Registration Full</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenRegistrationModal(evt)}
                      className="group relative w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-extrabold text-xs shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_35px_rgba(139,92,246,0.7)] transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer"
                    >
                      <Zap size={14} className="text-yellow-300 group-hover:rotate-12 transition-transform" />
                      <span>Register Now</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Student Event Registration Form / Cyberpunk Arena Payment Portal */}
      {registeringEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300">
          {isPaymentStep ? (
            <PaymentCard
              eventId={registeringEvent.id}
              eventTitle={registeringEvent.title}
              category={registeringEvent.category}
              amount={registeringEvent.fee}
              currency="INR"
              fullName={fullName.trim()}
              registrationNumber={regNo.trim().toUpperCase()}
              userEmail={currentEmail || currentUser?.email || `${regNo.toLowerCase()}@vitbhopal.ac.in`}
              phone={phone.trim()}
              branch={branch.trim()}
              initialState={paymentCardState}
              errorMessage={paymentErrorMessage}
              orderId={confirmedOrderId}
              razorpayPaymentId={confirmedPaymentId}
              onProceedToPay={handleProceedToPay}
              onClose={() => setRegisteringEvent(null)}
              onSuccessDone={() => {
                setRegisterSuccess(`Payment verified! Registration confirmed for ${registeringEvent.title}! ✦`);
                setRegisteringEvent(null);
              }}
            />
          ) : (
            <div className="bg-[#0a0d18]/95 border border-violet-500/40 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.35)] relative animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setRegisteringEvent(null)}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">
                  ✦ REGISTER FOR EVENT
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white leading-snug">{registeringEvent.title}</h3>
                <p className="text-xs text-slate-400">
                  Official tournament registration for VIT Bhopal students.
                </p>
              </div>

              <form onSubmit={handleConfirmRegistration} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Abhinav Mishra"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Registration Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 25BCY10254"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/15 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] uppercase transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">WhatsApp Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">Branch / Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. CSE (Gaming), AI/ML, ECE..."
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all font-medium"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/30 space-y-1 backdrop-blur-md">
                  <div className="flex justify-between items-center text-xs font-bold text-white">
                    <span>Entry Fee</span>
                    <span className="text-amber-400 font-mono text-sm">
                      {registeringEvent.fee === 0 ? "FREE" : `₹${registeringEvent.fee} INR`}
                    </span>
                  </div>
                </div>

                <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setRegisteringEvent(null)}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  {registeringEvent.fee > 0 ? (
                    <button
                      type="submit"
                      disabled={isSubmittingReg}
                      className="w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-extrabold shadow-[0_0_24px_rgba(139,92,246,0.45)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <CreditCard size={14} className="text-yellow-300" />
                      <span>Proceed to Payment (₹{registeringEvent.fee}) →</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSubmittingReg}
                      className="w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold shadow-[0_0_24px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      {isSubmittingReg ? "Confirming..." : "Confirm Free Registration"}
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
