"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { checkIsAdmin } from "@/lib/adminAuth";
import {
  fetchFutureEvents,
  fetchAllFaculty,
  createFutureEvent,
  updateFutureEvent,
  deleteFutureEvent,
  submitFacultyDecision,
  checkIsFaculty,
} from "@/lib/faculty";
import { FutureEventPlan, FacultyMember, FacultyApprovalStatus } from "@/types/faculty";
import { AuroraText } from "@/components/ui/aurora-text";
import {
  Calendar,
  CalendarDays,
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  FolderSync,
  ShieldCheck,
  UserCheck,
  Zap,
  Search,
  LogIn,
  Lock,
} from "lucide-react";

interface PlannedEventsProps {
  isAdmin?: boolean;
  isFaculty?: boolean;
  userEmail?: string;
  userName?: string;
  onRedirect?: () => void;
}

function parseDateStrToPicker(str: string): { picker: string; formatted: string } {
  if (!str) return { picker: "", formatted: "" };

  const dmyMatch = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return {
      picker: `${year}-${month}-${day}`,
      formatted: `${day}-${month}-${year}`,
    };
  }

  const ymdMatch = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, "0");
    const day = ymdMatch[3].padStart(2, "0");
    return {
      picker: `${year}-${month}-${day}`,
      formatted: `${day}-${month}-${year}`,
    };
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return {
      picker: `${year}-${month}-${day}`,
      formatted: `${day}-${month}-${year}`,
    };
  }

  return { picker: "", formatted: "" };
}

function getPresetDateObj(daysAhead: number): { picker: string; formatted: string; readable: string } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const formatted = `${day}-${month}-${year}`;
  const readable = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return {
    picker: `${year}-${month}-${day}`,
    formatted: formatted,
    readable: `${formatted} (${readable})`,
  };
}

export default function PlannedEvents({
  isAdmin: propIsAdmin,
  isFaculty: propIsFaculty,
  userEmail: propUserEmail,
  userName: propUserName,
}: PlannedEventsProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  const [effectiveIsAdmin, setEffectiveIsAdmin] = useState<boolean>(propIsAdmin || false);
  const [effectiveIsFaculty, setEffectiveIsFaculty] = useState<boolean>(propIsFaculty || false);
  const [effectiveEmail, setEffectiveEmail] = useState<string>(propUserEmail || "");
  const [effectiveName, setEffectiveName] = useState<string>(propUserName || "Faculty Member");

  // Auth & Role listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const adminStatus = await checkIsAdmin(user.email, user.uid);
        const facultyMember = await checkIsFaculty(user.email || "");
        setEffectiveIsAdmin(propIsAdmin !== undefined ? propIsAdmin : adminStatus);
        setEffectiveIsFaculty(propIsFaculty !== undefined ? propIsFaculty : Boolean(facultyMember));
        setEffectiveEmail(user.email || "");
        if (facultyMember?.name) setEffectiveName(facultyMember.name);
        else if (user.displayName) setEffectiveName(user.displayName);
      } else {
        setEffectiveIsAdmin(false);
        setEffectiveIsFaculty(false);
        setEffectiveEmail("");
      }
      setIsAuthChecking(false);
    });

    return () => unsub();
  }, [propIsAdmin, propIsFaculty]);

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

  const [events, setEvents] = useState<FutureEventPlan[]>([]);
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Approved" | "Pending" | "Revision">("All");

  // Admin / Faculty Proposal Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>("");
  const [formDatePicker, setFormDatePicker] = useState<string>("");
  const [formDateFormatted, setFormDateFormatted] = useState<string>("");
  const [formDateCustomText, setFormDateCustomText] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formDriveLink, setFormDriveLink] = useState<string>("");
  const [savingEvent, setSavingEvent] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Faculty Decision Modal State
  const [decisionModalEvent, setDecisionModalEvent] = useState<FutureEventPlan | null>(null);
  const [decisionType, setDecisionType] = useState<FacultyApprovalStatus>("approved");
  const [decisionRemarks, setDecisionRemarks] = useState<string>("");
  const [submittingDecision, setSubmittingDecision] = useState<boolean>(false);

  // Active Expanded Faculty Breakdown Accordion
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null);

  const canPropose = effectiveIsAdmin || effectiveIsFaculty;
  const canReview = effectiveIsFaculty;

  const sanitizedUserKey = useMemo(() => {
    return (effectiveEmail || "faculty_reviewer").toLowerCase().replace(/[^a-zA-Z0-9_]/g, "_");
  }, [effectiveEmail]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedEvents, fetchedFaculty] = await Promise.all([
        fetchFutureEvents(),
        fetchAllFaculty(),
      ]);
      setEvents(fetchedEvents);
      setFacultyList(fetchedFaculty);
    } catch (err) {
      console.error("Error loading planned events & faculty:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && (effectiveIsAdmin || effectiveIsFaculty)) {
      loadData();
    }
  }, [currentUser, effectiveIsAdmin, effectiveIsFaculty, loadData]);

  const showStatus = (text: string, type: "success" | "error") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const applyDatePreset = (daysAhead: number) => {
    const preset = getPresetDateObj(daysAhead);
    setFormDatePicker(preset.picker);
    setFormDateFormatted(preset.formatted);
    setFormDateCustomText(preset.readable);
  };

  // Open Create modal (Admin / Faculty)
  const handleOpenCreateModal = () => {
    if (!canPropose) return;
    setEditingEventId(null);
    setFormTitle("");
    const defaultPreset = getPresetDateObj(14);
    setFormDatePicker(defaultPreset.picker);
    setFormDateFormatted(defaultPreset.formatted);
    setFormDateCustomText(defaultPreset.readable);
    setFormDescription("");
    setFormDriveLink("");
    setIsModalOpen(true);
  };

  // Open Edit modal (Admin / Faculty)
  const handleOpenEditModal = (event: FutureEventPlan) => {
    if (!canPropose) return;
    setEditingEventId(event.id);
    setFormTitle(event.title);
    const parsed = parseDateStrToPicker(event.tentativeDate);
    setFormDatePicker(parsed.picker);
    setFormDateFormatted(parsed.formatted);
    setFormDateCustomText(event.tentativeDate || parsed.formatted);
    setFormDescription(event.description);
    setFormDriveLink(event.driveLink);
    setIsModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPropose) return;
    const finalDate = formDateCustomText.trim() || formDateFormatted || formDatePicker;
    if (!formTitle.trim() || !finalDate || !formDescription.trim()) {
      showStatus("Please complete all required fields (Title, Date, Description).", "error");
      return;
    }

    setSavingEvent(true);
    try {
      if (editingEventId) {
        const ok = await updateFutureEvent(editingEventId, {
          title: formTitle.trim(),
          tentativeDate: finalDate,
          description: formDescription.trim(),
          driveLink: formDriveLink.trim(),
        });
        if (ok) {
          showStatus("Event proposal updated successfully.", "success");
          setIsModalOpen(false);
          loadData();
        } else {
          showStatus("Failed to update event proposal.", "error");
        }
      } else {
        const created = await createFutureEvent(
          {
            title: formTitle.trim(),
            tentativeDate: finalDate,
            description: formDescription.trim(),
            driveLink: formDriveLink.trim(),
          },
          effectiveEmail || "lead@vrgc.org"
        );
        if (created) {
          showStatus("Event proposal published for faculty review.", "success");
          setIsModalOpen(false);
          loadData();
        } else {
          showStatus("Failed to create event proposal.", "error");
        }
      }
    } catch (err) {
      console.error("Save event error:", err);
      showStatus("An unexpected error occurred.", "error");
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, title: string) => {
    if (!effectiveIsAdmin) return;
    if (!window.confirm(`Are you sure you want to delete the event plan "${title}"?`)) {
      return;
    }
    const ok = await deleteFutureEvent(eventId);
    if (ok) {
      showStatus("Event plan deleted successfully.", "success");
      loadData();
    } else {
      showStatus("Failed to delete event plan.", "error");
    }
  };

  // Faculty Decision Handlers
  const handleOpenDecisionModal = (event: FutureEventPlan, status: FacultyApprovalStatus) => {
    if (!canReview) return;
    const existingDecision = event.facultyDecisions?.[sanitizedUserKey];
    setDecisionModalEvent(event);
    setDecisionType(status);
    setDecisionRemarks(existingDecision?.remarks || "");
  };

  const handleSubmitDecision = async () => {
    if (!decisionModalEvent || !canReview) return;
    setSubmittingDecision(true);
    try {
      const ok = await submitFacultyDecision(
        decisionModalEvent.id,
        effectiveEmail || "faculty@vrgc.org",
        effectiveName || "Faculty Member",
        decisionType,
        decisionRemarks.trim()
      );
      if (ok) {
        showStatus(`Decision recorded: ${decisionType.toUpperCase()}`, "success");
        setDecisionModalEvent(null);
        loadData();
      } else {
        showStatus("Failed to record decision.", "error");
      }
    } catch (err) {
      console.error("Decision submission error:", err);
      showStatus("Error recording decision.", "error");
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Filtered list
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        evt.title.toLowerCase().includes(q) ||
        evt.description.toLowerCase().includes(q) ||
        evt.tentativeDate.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === "All") return true;

      const decisions = evt.facultyDecisions || {};
      let approvedCount = 0;
      let rejectedCount = 0;
      let pendingCount = 0;

      facultyList.forEach((fac) => {
        const facKey = fac.email.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "_");
        const st = decisions[facKey]?.status || "pending";
        if (st === "approved") approvedCount++;
        else if (st === "rejected") rejectedCount++;
        else pendingCount++;
      });

      if (statusFilter === "Approved") return approvedCount > 0 && rejectedCount === 0;
      if (statusFilter === "Revision") return rejectedCount > 0;
      if (statusFilter === "Pending") return approvedCount === 0 && rejectedCount === 0;

      return true;
    });
  }, [events, searchQuery, statusFilter, facultyList]);

  // Overall statistics
  const totalProposals = events.length;
  const approvedProposals = events.filter((e) => {
    const d = e.facultyDecisions || {};
    const hasApproved = Object.values(d).some((v) => v.status === "approved");
    const hasRejected = Object.values(d).some((v) => v.status === "rejected");
    return hasApproved && !hasRejected;
  }).length;
  const pendingProposals = totalProposals - approvedProposals;

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
              ✦ ACCESS CONTROLLED PORTAL
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Sign In to View <AuroraText>Proposals</AuroraText>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Official VRGC proposals, schedule milestones, and faculty reviews are protected. Please sign in with your Google account.
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

  // ── Role Gate: Only Admin and Faculty can access Planned Events / Proposals ──
  if (!effectiveIsAdmin && !effectiveIsFaculty) {
    return (
      <div className="p-4 sm:p-6 md:p-10 max-w-xl mx-auto w-full my-12 text-slate-100 select-none animate-in fade-in duration-300">
        <div className="p-8 sm:p-10 rounded-3xl bg-[#0a0d18]/90 border border-violet-500/35 relative overflow-hidden backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.3)] text-center space-y-6">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
              ✦ FACULTY &amp; ADMIN ACCESS ONLY
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Restricted <AuroraText>Proposals Desk</AuroraText>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              The Event Proposals &amp; Faculty Review Desk is reserved exclusively for verified Faculty Coordinators and Club Administrators.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <Link
              href="/event-register"
              className="py-3 px-6 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all flex items-center gap-2"
            >
              <span>Explore Tournaments →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow min-h-screen p-4 sm:p-6 md:p-10 text-left text-slate-100 select-none">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <header className="p-7 md:p-10 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/30 relative overflow-hidden backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_40px_rgba(124,58,237,0.15)] flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300">
          <div className="space-y-2.5 relative z-10">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                <CalendarDays size={13} className="text-violet-400" />
                <span>✦ EVENT PROPOSALS &amp; FACULTY DESK</span>
              </span>

              {/* Role Indicators */}
              {effectiveIsAdmin && (
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                  <ShieldCheck size={12} />
                  ADMIN
                </span>
              )}

              {effectiveIsFaculty && (
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                  <UserCheck size={12} />
                  FACULTY REVIEWER
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight flex items-center gap-3">
              Planned <AuroraText>Future Events</AuroraText>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-2xl leading-relaxed">
              Formal review and proposal lifecycle for upcoming VRGC campus tournaments and hackathons. Faculty members review agendas and record official verdicts.
            </p>
          </div>

          {/* Action button: Propose event (Only Faculty & Admin) */}
          {canPropose && (
            <div className="relative z-10 flex items-center gap-3 flex-wrap self-start md:self-auto shrink-0">
              <button
                onClick={handleOpenCreateModal}
                className="group relative px-7 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-extrabold shadow-[0_0_24px_rgba(139,92,246,0.45)] hover:shadow-[0_0_35px_rgba(139,92,246,0.7)] transition-all duration-300 flex items-center gap-2.5 active:scale-95"
              >
                <Zap size={14} className="text-yellow-300 group-hover:rotate-12 transition-transform" />
                <span>Propose Future Event</span>
              </button>
            </div>
          )}
        </header>

        {/* Quick KPI Stat Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
            <span className="text-[10px] font-extrabold text-violet-300 tracking-wider uppercase block mb-1">
              TOTAL PROPOSALS
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">{totalProposals}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">Scheduled on campus calendar</span>
          </div>

          <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
            <span className="text-[10px] font-extrabold text-emerald-300 tracking-wider uppercase block mb-1">
              FACULTY APPROVED
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{approvedProposals}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">Passed formal review</span>
          </div>

          <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
            <span className="text-[10px] font-extrabold text-amber-300 tracking-wider uppercase block mb-1">
              IN REVIEW
            </span>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{pendingProposals}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">Awaiting faculty verdict</span>
          </div>

          <div className="p-5 rounded-3xl bg-[#0a0d18]/85 border border-violet-500/20 backdrop-blur-xl shadow-lg">
            <span className="text-[10px] font-extrabold text-indigo-300 tracking-wider uppercase block mb-1">
              REVIEW MENTORS
            </span>
            <div className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">{facultyList.length || 1}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">Registered department leads</span>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search proposals by title, date, or agenda…"
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
            {(["All", "Approved", "Pending", "Revision"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 active:scale-95 shrink-0 ${
                  statusFilter === tab
                    ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                    : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                }`}
              >
                {tab === "All" ? "All Proposals" : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Status Toast Message */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 border backdrop-blur-2xl shadow-lg transition-all animate-in fade-in duration-300 ${
              statusMessage.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.25)]"
                : "bg-rose-950/60 border-rose-500/40 text-rose-300 shadow-[0_0_25px_rgba(244,63,94,0.25)]"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <XCircle size={16} className="text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <span className="text-xs text-violet-300 font-mono tracking-widest uppercase">
              Loading Event Proposals…
            </span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-[#0a0d18]/85 border border-violet-500/20 rounded-3xl p-12 text-center space-y-4 backdrop-blur-2xl shadow-[0_20px_45px_rgba(0,0,0,0.6),0_0_30px_rgba(124,58,237,0.12)]">
            <Calendar className="w-14 h-14 mx-auto text-violet-400/40" />
            <h3 className="text-xl font-bold text-white">No Event Proposals Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {searchQuery
                ? "No proposal matches your search query. Try clearing the search."
                : canPropose
                ? 'Click "+ Propose Future Event" above to publish an event proposal with tentative dates, description, and Drive assets.'
                : "There are currently no proposals published."}
            </p>
            {canPropose && (
              <button
                onClick={handleOpenCreateModal}
                className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.35)] active:scale-95"
              >
                <Plus size={15} />
                Create First Event Proposal
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {filteredEvents.map((event) => {
              const decisions = event.facultyDecisions || {};
              const userDecision = decisions[sanitizedUserKey]?.status || "pending";
              const userRemarks = decisions[sanitizedUserKey]?.remarks || "";

              let approvedCount = 0;
              let rejectedCount = 0;
              let pendingCount = 0;

              facultyList.forEach((fac) => {
                const facKey = fac.email.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "_");
                const st = decisions[facKey]?.status || "pending";
                if (st === "approved") approvedCount++;
                else if (st === "rejected") rejectedCount++;
                else pendingCount++;
              });

              const isExpanded = expandedBreakdownId === event.id;

              return (
                <div
                  key={event.id}
                  className="group relative bg-[#0a0d18]/85 border border-violet-500/25 hover:border-violet-400/60 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_45px_rgba(0,0,0,0.6),0_0_30px_rgba(124,58,237,0.12)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(139,92,246,0.3)] space-y-6 overflow-hidden transition-all duration-300 hover:-translate-y-1.5"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 animate-gradient" />

                  {/* Event Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2.5 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-3.5 py-1 rounded-full text-[11px] font-bold bg-violet-500/15 text-violet-200 border border-violet-500/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                          <Calendar size={13} className="text-violet-400" />
                          Tentative Date: <span className="font-mono text-white">{event.tentativeDate}</span>
                        </span>

                        {/* Overall Status Badge */}
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold border flex items-center gap-1.5 ${
                            approvedCount > 0 && rejectedCount === 0
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                              : rejectedCount > 0
                              ? "bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                              : "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          {approvedCount > 0 && rejectedCount === 0
                            ? `Approved by Faculty (${approvedCount}/${facultyList.length || 1})`
                            : rejectedCount > 0
                            ? `Requires Revision (${rejectedCount} Rejections)`
                            : `Review in Progress (${pendingCount} Pending)`}
                        </span>
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-black text-white group-hover:text-violet-200 transition-colors duration-200 tracking-tight">
                        {event.title}
                      </h2>
                    </div>

                    {/* Admin Action Menu */}
                    {effectiveIsAdmin && (
                      <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(event)}
                          className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        >
                          <Edit3 size={13} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id, event.title)}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Event Description */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {event.description}
                  </div>

                  {/* Drive Assets & Metadata */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-white/10">
                    <div className="flex items-center gap-3">
                      {event.driveLink ? (
                        <a
                          href={event.driveLink.startsWith("http") ? event.driveLink : `https://${event.driveLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2.5 rounded-2xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 hover:text-violet-200 text-xs font-bold transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.15)] active:scale-95"
                        >
                          <FolderSync size={15} />
                          Open Google Drive Proposal &amp; Assets
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No Google Drive link attached</span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono">
                      Published:{" "}
                      {new Date(event.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>

                  {/* Faculty Decision Bar (Visible ONLY to Faculty) */}
                  {canReview && (
                    <div className="bg-violet-950/30 border border-violet-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-inner">
                      <div className="space-y-1">
                        <span className="text-[10px] font-extrabold text-violet-300 uppercase tracking-wider block">
                          YOUR FACULTY VERDICT
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${
                              userDecision === "approved"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : userDecision === "rejected"
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            }`}
                          >
                            {userDecision === "approved"
                              ? "✓ APPROVED BY YOU"
                              : userDecision === "rejected"
                              ? "✕ REJECTED BY YOU"
                              : "⏳ PENDING REVIEW"}
                          </span>
                          {userRemarks && (
                            <span className="text-xs text-slate-400 italic">
                              Remarks: &quot;{userRemarks}&quot;
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Vote Buttons */}
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => handleOpenDecisionModal(event, "approved")}
                          className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all duration-200 flex items-center gap-2 shadow-md active:scale-95 cursor-pointer ${
                            userDecision === "approved"
                              ? "bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                              : "bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300"
                          }`}
                        >
                          <ThumbsUp size={14} />
                          Approve Proposal
                        </button>

                        <button
                          onClick={() => handleOpenDecisionModal(event, "rejected")}
                          className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all duration-200 flex items-center gap-2 shadow-md active:scale-95 cursor-pointer ${
                            userDecision === "rejected"
                              ? "bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)]"
                              : "bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300"
                          }`}
                        >
                          <ThumbsDown size={14} />
                          Reject Proposal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Faculty Oversight Matrix Accordion */}
                  <div className="border-t border-white/10 pt-4">
                    <button
                      onClick={() => setExpandedBreakdownId(isExpanded ? null : event.id)}
                      className="w-full flex items-center justify-between text-xs font-bold text-violet-300 hover:text-white transition-colors duration-200 py-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck size={15} />
                        <span>
                          Faculty Decision Breakdown ({approvedCount} Approved • {rejectedCount} Rejected • {pendingCount} Pending)
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {isExpanded && (
                      <div className="mt-4 bg-black/40 border border-white/10 rounded-2xl p-4 divide-y divide-white/5 space-y-3 animate-in fade-in duration-200">
                        {facultyList.length === 0 ? (
                          <p className="text-xs text-slate-500 italic py-2">No faculty records found in database.</p>
                        ) : (
                          facultyList.map((fac) => {
                            const facKey = fac.email.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "_");
                            const dec = decisions[facKey];
                            const facStatus = dec?.status || "pending";

                            return (
                              <div
                                key={fac.email}
                                className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">{fac.name}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">({fac.email})</span>
                                  </div>
                                  {dec?.remarks && (
                                    <p className="text-[11px] text-slate-400 italic mt-0.5">
                                      Remarks: &quot;{dec.remarks}&quot;
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                      facStatus === "approved"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                        : facStatus === "rejected"
                                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    }`}
                                  >
                                    {facStatus === "approved"
                                      ? "✓ Approved"
                                      : facStatus === "rejected"
                                      ? "✕ Rejected"
                                      : "⏳ Pending"}
                                  </span>
                                  {dec?.respondedAt && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {new Date(dec.respondedAt).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin / Faculty Proposal Modal */}
      {isModalOpen && canPropose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-[#0a0d18]/95 border border-violet-500/40 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.35)] space-y-6 text-left animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-xl sm:text-2xl font-black text-white">
                {editingEventId ? "Edit Event Proposal" : "Propose New Future Event"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-full text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-violet-300 mb-1.5">
                  EVENT TITLE *
                </label>
                <input
                  required
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. XR Metaverse Hackathon '26"
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-3 text-sm text-white transition-all font-medium outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-violet-300">
                    TENTATIVE EVENT DATE *
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">DD-MM-YYYY &amp; Custom Label</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-300">
                      Date Picker (DD-MM-YYYY)
                    </label>
                    <input
                      type="date"
                      value={formDatePicker}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormDatePicker(val);
                        if (val) {
                          const [y, m, d] = val.split("-");
                          const formatted = `${d}-${m}-${y}`;
                          setFormDateFormatted(formatted);
                          const dateObj = new Date(`${val}T00:00:00`);
                          const readable = dateObj.toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          });
                          setFormDateCustomText(`${formatted} (${readable})`);
                        }
                      }}
                      className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-2.5 text-xs text-white font-mono transition-all outline-none"
                    />
                    {formDateFormatted && (
                      <div className="flex items-center gap-1 text-[10px] text-violet-300 font-mono pt-1">
                        <span className="text-slate-500 font-sans">Selected:</span>
                        <span className="bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 rounded-md font-bold">
                          {formDateFormatted}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-slate-300">
                      Custom Date / Description
                    </label>
                    <input
                      type="text"
                      required
                      value={formDateCustomText}
                      onChange={(e) => setFormDateCustomText(e.target.value)}
                      placeholder="e.g. 15-10-2026 or 15th October 2026"
                      className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-2.5 text-xs text-white transition-all outline-none"
                    />
                    <p className="text-[10px] text-slate-500">
                      Shown on proposal card &amp; faculty review desk.
                    </p>
                  </div>
                </div>

                {/* Presets */}
                <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1">
                  <span className="text-[10px] text-slate-400 font-semibold flex-shrink-0">Presets:</span>
                  {[
                    { label: "+7 Days", days: 7 },
                    { label: "+14 Days", days: 14 },
                    { label: "+30 Days", days: 30 },
                    { label: "+60 Days", days: 60 },
                    { label: "+90 Days", days: 90 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyDatePreset(preset.days)}
                      className="px-3 py-1 rounded-xl text-[10px] font-bold bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 transition-all flex-shrink-0 active:scale-95 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-violet-300 mb-1.5">
                  EVENT DESCRIPTION &amp; AGENDA *
                </label>
                <textarea
                  required
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the objectives, expected footfall, guest speakers, budget requirements, and venue details..."
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-3 text-sm text-white transition-all font-medium outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-violet-300 mb-1.5">
                  GOOGLE DRIVE LINK (PROPOSAL / POSTER / SLIDES)
                </label>
                <input
                  type="url"
                  value={formDriveLink}
                  onChange={(e) => setFormDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-3 text-sm text-white transition-all font-medium outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={savingEvent}
                  type="submit"
                  className="px-7 py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-extrabold shadow-[0_0_24px_rgba(139,92,246,0.45)] flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  {savingEvent ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Saving…
                    </>
                  ) : (
                    "Save & Publish Plan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Faculty Decision Modal */}
      {decisionModalEvent && canReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-[#0a0d18]/95 border border-violet-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.35)] space-y-5 text-left animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white">Record Faculty Decision</h3>
                <p className="text-xs text-violet-300 truncate mt-0.5">{decisionModalEvent.title}</p>
              </div>
              <button
                onClick={() => setDecisionModalEvent(null)}
                className="p-2 rounded-full text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  VERDICT SELECTION
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecisionType("approved")}
                    className={`py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all duration-200 active:scale-95 cursor-pointer ${
                      decisionType === "approved"
                        ? "bg-emerald-600 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                        : "bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/50"
                    }`}
                  >
                    <CheckCircle2 size={15} />
                    Approve Plan
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionType("rejected")}
                    className={`py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all duration-200 active:scale-95 cursor-pointer ${
                      decisionType === "rejected"
                        ? "bg-rose-600 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.5)]"
                        : "bg-rose-950/30 border-rose-500/30 text-rose-300 hover:bg-rose-950/50"
                    }`}
                  >
                    <XCircle size={15} />
                    Reject Plan
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  OPTIONAL REMARKS / FEEDBACK FOR CLUB LEADS
                </label>
                <textarea
                  rows={3}
                  value={decisionRemarks}
                  onChange={(e) => setDecisionRemarks(e.target.value)}
                  placeholder="e.g. Approved provided lab safety measures are verified, or Tentative date conflicts with exams..."
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl px-4 py-2.5 text-xs text-white transition-all outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDecisionModalEvent(null)}
                  className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={submittingDecision}
                  onClick={handleSubmitDecision}
                  className={`px-6 py-3 rounded-2xl text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
                    decisionType === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                      : "bg-rose-600 hover:bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)]"
                  }`}
                >
                  {submittingDecision ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Recording…
                    </>
                  ) : (
                    "Confirm Decision"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
