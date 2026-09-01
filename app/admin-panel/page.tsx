"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { checkIsAdmin, getAllAdmins, AdminUser } from "@/lib/adminAuth";
import dynamic from "next/dynamic";
import { collection, onSnapshot, doc, query, where, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
  Brain,
  Dices,
  UserCheck,
  Sparkles,
  Trash2,
  Download,
  UserX,
  CheckSquare,
  Square,
  Tag,
  Clock,
  Calendar,
  Users,
  X,
  Plus,
  Play,
  Lock,
} from "lucide-react";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { quizData, QuizQuestion } from "@/quizcontent/data";

const AdminConfirmModal = dynamic(
  () => import("@/components/ui/admin-confirm-modal").then((mod) => mod.AdminConfirmModal),
  { ssr: false }
);

const SeedDatabaseButton = dynamic(
  () => import("@/components/SeedDatabaseButton").then((mod) => mod.SeedDatabaseButton),
  { ssr: false }
);

const PlannedEvents = dynamic(
  () => import("@/components/events/PlannedEvents"),
  { ssr: false }
);

const PAGE_SIZE = 25;
const SEAT_LIMIT = 80;

const BAR_GRADIENTS = [
  "from-violet-600 via-indigo-500 to-cyan-400",
  "from-pink-500 via-rose-500 to-amber-400",
  "from-emerald-500 via-teal-400 to-cyan-400",
  "from-amber-400 via-orange-500 to-red-500",
  "from-purple-500 via-fuchsia-500 to-pink-400",
] as const;

interface EventItem {
  id: string;
  title: string;
  category: string;
  status: string;
  description?: string;
  date?: string;
  venue?: string;
  location?: string;
  fee?: number;
  originalFee?: number;
  createdAt?: string;
}

interface ParticipantItem {
  id: string;
  registrationNumber: string;
  fullName: string;
  name?: string;
  email?: string;
  role?: string;
  team?: string;
  totalScore?: number;
  registeredAt?: any;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Dashboard Stats & Data
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalEvents: 0,
    activeAdmins: 0,
    totalTeams: 0,
  });
  const [participantsList, setParticipantsList] = useState<ParticipantItem[]>([]);
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [pollsList, setPollsList] = useState<any[]>([]);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "leaderboard" | "events" | "proposals" | "polls" | "quizzes" | "users" | "tools"
  >("overview");

  // Participant list pagination & search
  const [participantSearch, setParticipantSearch] = useState("");
  const [visibleParticipantCount, setVisibleParticipantCount] = useState(PAGE_SIZE);

  // Global Settings State
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [globalQuizOpen, setGlobalQuizOpen] = useState(false);
  const [quizMode, setQuizMode] = useState<"single" | "multiple">("multiple");
  const [activeQuestionIds, setActiveQuestionIds] = useState<number[]>([]);
  const [quizResponses, setQuizResponses] = useState<{ [qId: number]: { [regNum: string]: number } }>({});
  const [expandedDetails, setExpandedDetails] = useState<{ [qId: number]: boolean }>({});

  // Poll Form State
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollStatus, setPollStatus] = useState<"active" | "closed" | "draft">("active");
  const [isSavingPoll, setIsSavingPoll] = useState(false);

  // Event Form State
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventCategory, setEventCategory] = useState("Esports Tournament");
  const [eventStatus, setEventStatus] = useState("live");
  const [eventDescription, setEventDescription] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventFee, setEventFee] = useState<string>("0");
  const [eventOriginalFee, setEventOriginalFee] = useState<string>("100");
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // Event Registration Desk State
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
  const [adminPanelEventId, setAdminPanelEventId] = useState<string | null>(null);
  const [adminRegistrants, setAdminRegistrants] = useState<Record<string, any[]>>({});
  const [removingRegistrantId, setRemovingRegistrantId] = useState<string | null>(null);
  const [togglingPresenceId, setTogglingPresenceId] = useState<string | null>(null);
  const [registrantSearch, setRegistrantSearch] = useState<string>("");
  const [presenceFilter, setPresenceFilter] = useState<"All" | "Present" | "Absent">("All");

  // Participant Edit & Delete State
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editParticipantName, setEditParticipantName] = useState("");
  const [editParticipantReg, setEditParticipantReg] = useState("");
  const [editParticipantScore, setEditParticipantScore] = useState(0);
  const [isSavingParticipant, setIsSavingParticipant] = useState(false);

  // Random Team Selector State
  const [selectedTeamAPlayer, setSelectedTeamAPlayer] = useState<ParticipantItem | null>(null);
  const [selectedTeamBPlayer, setSelectedTeamBPlayer] = useState<ParticipantItem | null>(null);
  const [isSelectingTeamA, setIsSelectingTeamA] = useState(false);
  const [isSelectingTeamB, setIsSelectingTeamB] = useState(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmLabel: "Delete",
    onConfirm: () => { },
  });

  // Auth verification

  // Auth verification
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        router.push("/admin-panel/login");
        return;
      }

      setUser(currentUser);
      const authorized = await checkIsAdmin(currentUser.email, currentUser.uid);
      setIsAdmin(authorized);

      if (!authorized) {
        setLoading(false);
        router.push("/admin-panel/login");
        return;
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Real-time Dashboard Data Listeners
  useEffect(() => {
    if (!isAdmin) return;

    // 1. Participants Realtime
    const unsubParticipants = onSnapshot(collection(db, "participants"), (snap) => {
      const participantsData: ParticipantItem[] = [];
      snap.forEach((d) => participantsData.push({ id: d.id, ...d.data() } as ParticipantItem));
      setParticipantsList(participantsData);
      setStats((s) => ({ ...s, totalUsers: snap.size }));
    });

    // 2. Events Realtime
    const unsubEvents = onSnapshot(collection(db, "events"), (snap) => {
      const eventsData: EventItem[] = [];
      snap.forEach((d) => eventsData.push({ id: d.id, ...d.data() } as EventItem));
      setEventsList(eventsData);
      setStats((s) => ({ ...s, totalEvents: snap.size }));
    });

    // 3. Polls Realtime
    const unsubPolls = onSnapshot(collection(db, "polls"), (snap) => {
      const pollsData: any[] = [];
      snap.forEach((d) => pollsData.push({ id: d.id, ...d.data() }));
      setPollsList(pollsData);
    });

    // 4. Registration Settings Realtime
    const unsubRegistration = onSnapshot(doc(db, "settings", "registration"), (docSnap) => {
      if (docSnap.exists()) {
        setRegistrationOpen(!!docSnap.data().isOpen);
      }
    });

    // 5. Global Quiz Settings & Active Questions Realtime
    const unsubQuizToggle = onSnapshot(doc(db, "settings", "quiz"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalQuizOpen(!!data.isOpen);
        setQuizMode(data.mode || "multiple");
        setActiveQuestionIds(data.activeQuestionIds || []);
      }
    });

    // 6. Real-time Quiz Responses for Analytics
    const unsubQuizResponses = onSnapshot(collection(db, "quiz_responses"), (snap) => {
      const responses: { [qId: number]: { [regNum: string]: number } } = {};
      snap.forEach((d) => {
        const qId = Number(d.id);
        const data = d.data();
        responses[qId] = data.answers || {};
      });
      setQuizResponses(responses);
    });

    // 7. Leaderboard Teams
    const unsubLeaderboard = onSnapshot(collection(db, "leaderboard"), (snap) => {
      setStats((s) => ({ ...s, totalTeams: snap.size }));
    });

    // 8. Event Registrations Realtime Telemetry
    const unsubEventRegs = onSnapshot(collection(db, "event_registrations"), (snap) => {
      const counts: Record<string, number> = {};
      snap.forEach((d) => {
        const data = d.data();
        const eid = data.event_id as string;
        if (!eid) return;
        counts[eid] = (counts[eid] || 0) + 1;
      });
      setRegistrationCounts(counts);
    });

    // Admins
    getAllAdmins().then((admins) => {
      setAdminsList(admins);
      setStats((s) => ({ ...s, activeAdmins: admins.length > 0 ? admins.length : 2 }));
    });

    return () => {
      unsubParticipants();
      unsubEvents();
      unsubPolls();
      unsubRegistration();
      unsubQuizToggle();
      unsubQuizResponses();
      unsubLeaderboard();
      unsubEventRegs();
    };
  }, [isAdmin]);

  // Admin Registrant Panel Real-time Listener
  useEffect(() => {
    if (!adminPanelEventId || !isAdmin) return;
    const q = query(
      collection(db, "event_registrations"),
      where("event_id", "==", adminPanelEventId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          docId: d.id,
          full_name: data.full_name || "",
          user_email: data.user_email || "",
          registration_number: data.registration_number || "",
          phone: data.phone || "",
          branch: data.branch || "",
          registered_at: data.registered_at,
          is_present: Boolean(data.is_present),
        });
      });
      setAdminRegistrants((prev) => ({ ...prev, [adminPanelEventId]: list }));
    });
    return () => unsub();
  }, [adminPanelEventId, isAdmin]);

  // Memoized filtered participants search across full dataset
  const filteredParticipants = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    if (!q) return participantsList;
    return participantsList.filter((p) => {
      const name = (p.fullName || p.name || "").toLowerCase();
      const reg = (p.registrationNumber || p.id || "").toLowerCase();
      return name.includes(q) || reg.includes(q);
    });
  }, [participantsList, participantSearch]);

  // Paginated participants slice for current view
  const visibleParticipants = useMemo(() => {
    return filteredParticipants.slice(0, visibleParticipantCount);
  }, [filteredParticipants, visibleParticipantCount]);

  const hasMoreParticipants = visibleParticipantCount < filteredParticipants.length;

  const handleLoadMoreParticipants = useCallback(() => {
    setVisibleParticipantCount((prev) => prev + PAGE_SIZE);
  }, []);

  const handleToggleRegistration = useCallback(async () => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const nextState = !registrationOpen;
      await setDoc(
        doc(db, "settings", "registration"),
        {
          isOpen: nextState,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error toggling registration status:", err);
      alert("Failed to update registration status.");
    }
  }, [registrationOpen]);

  // QUIZ CONTROL HANDLERS
  const handleToggleGlobalQuiz = useCallback(async () => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(
        doc(db, "settings", "quiz"),
        {
          isOpen: !globalQuizOpen,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error toggling global quiz:", err);
      alert("Failed to toggle global quiz.");
    }
  }, [globalQuizOpen]);

  const handleSetQuizMode = useCallback(async (mode: "single" | "multiple") => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      let newActive = activeQuestionIds;
      if (mode === "single" && activeQuestionIds.length > 1) {
        newActive = [activeQuestionIds[0]];
      }
      await setDoc(
        doc(db, "settings", "quiz"),
        {
          mode,
          activeQuestionIds: newActive,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error setting quiz mode:", err);
    }
  }, [activeQuestionIds]);

  const handleToggleQuestionActive = useCallback(async (qId: number) => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      let newActive: number[] = [];
      if (quizMode === "single") {
        newActive = activeQuestionIds.includes(qId) ? [] : [qId];
      } else {
        newActive = activeQuestionIds.includes(qId)
          ? activeQuestionIds.filter((id) => id !== qId)
          : [...activeQuestionIds, qId];
      }
      await setDoc(
        doc(db, "settings", "quiz"),
        {
          activeQuestionIds: newActive,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error toggling question active status:", err);
    }
  }, [quizMode, activeQuestionIds]);

  // NEXT QUESTION HANDLER: Enforces Single Question Mode, closes previous & opens next question
  const handleNextQuestion = useCallback(async () => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      let nextId = 1;

      if (activeQuestionIds.length > 0) {
        const currentId = activeQuestionIds[0];
        const currentIndex = quizData.findIndex((q) => q.id === currentId);
        if (currentIndex !== -1 && currentIndex < quizData.length - 1) {
          nextId = quizData[currentIndex + 1].id;
        } else if (currentIndex === quizData.length - 1) {
          nextId = quizData[0].id; // Loop back to Question #1 if at the end
        } else {
          nextId = quizData[0].id;
        }
      } else {
        nextId = quizData[0].id;
      }

      await setDoc(
        doc(db, "settings", "quiz"),
        {
          mode: "single",
          activeQuestionIds: [nextId],
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error advancing to next question:", err);
    }
  }, [activeQuestionIds]);

  const handleActivateAllQuestions = useCallback(async () => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const allIds = quizData.map((q) => q.id);
      await setDoc(
        doc(db, "settings", "quiz"),
        {
          mode: "multiple",
          activeQuestionIds: allIds,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error activating all questions:", err);
    }
  }, []);

  const handleDeactivateAllQuestions = useCallback(async () => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(
        doc(db, "settings", "quiz"),
        {
          activeQuestionIds: [],
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Error deactivating all questions:", err);
    }
  }, []);

  const handleResetQuizResponses = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: "Reset All Quiz Answers to 0?",
      description: (
        <div>
          <p className="text-rose-300 font-bold mb-2">⚠️ RESET ALL QUIZ RESPONSES:</p>
          <p>
            This action will permanently delete all submitted participant answers across all 15 trivia questions in the <code className="text-violet-300">quiz_responses</code> collection.
          </p>
          <p className="text-xs text-slate-400 font-semibold pt-2">
            Real-time analytics and answer tallies will be reset to 0. Proceed?
          </p>
        </div>
      ),
      confirmLabel: "Reset All Quiz Answers",
      onConfirm: async () => {
        try {
          const { collection, getDocs, doc, writeBatch } = await import("firebase/firestore");
          const qSnap = await getDocs(collection(db, "quiz_responses"));
          
          if (qSnap.empty) {
            alert("No quiz answers found in database to reset.");
            return;
          }

          let qBatch = writeBatch(db);
          let qCount = 0;
          qSnap.docs.forEach((d) => {
            qBatch.delete(doc(db, "quiz_responses", d.id));
            qCount++;
            if (qCount % 400 === 0) {
              qBatch.commit();
              qBatch = writeBatch(db);
            }
          });
          if (qCount % 400 !== 0) await qBatch.commit();

          setQuizResponses({});
          alert("✅ Successfully reset all quiz answers to 0!");
        } catch (err: any) {
          console.error("Error resetting quiz answers:", err);
          alert(`❌ Failed to reset quiz responses: ${err.message}`);
        }
      },
    });
  }, []);

  const toggleExpandDetails = useCallback((qId: number) => {
    setExpandedDetails((prev) => ({ ...prev, [qId]: !prev[qId] }));
  }, []);

  // Map participant reg number to full name & team for analytics
  const participantMap = useMemo(() => {
    const map: { [regNum: string]: string } = {};
    participantsList.forEach((p) => {
      const reg = (p.registrationNumber || p.id || "").toUpperCase();
      map[reg] = p.fullName || p.name || reg;
    });
    return map;
  }, [participantsList]);

  const participantTeamMap = useMemo(() => {
    const map: { [regNum: string]: string } = {};
    participantsList.forEach((p) => {
      const reg = (p.registrationNumber || p.id || "").toUpperCase();
      if (p.team) map[reg] = p.team;
    });
    return map;
  }, [participantsList]);

  // POLL HANDLERS
  const handleOpenPollModal = useCallback((poll?: any) => {
    if (poll) {
      setEditingPollId(poll.id);
      setPollQuestion(poll.question || "");
      setPollOptions(poll.options ? poll.options.map((opt: any) => opt.text) : ["", ""]);
      setPollStatus(poll.status || "active");
    } else {
      setEditingPollId(null);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollStatus("active");
    }
    setPollModalOpen(true);
  }, []);

  const handleSavePoll = useCallback(async () => {
    if (!pollQuestion.trim()) {
      alert("Please enter a poll question.");
      return;
    }
    const cleanOptions = pollOptions.filter((opt) => opt.trim().length > 0);
    if (cleanOptions.length < 2) {
      alert("Please provide at least 2 options for the poll.");
      return;
    }

    setIsSavingPoll(true);
    try {
      const { doc, setDoc, updateDoc } = await import("firebase/firestore");

      if (editingPollId) {
        const existingPoll = pollsList.find((p) => p.id === editingPollId);
        const updatedOptions = cleanOptions.map((text, idx) => {
          const prevOpt = existingPoll?.options?.[idx];
          return {
            id: prevOpt?.id || `opt_${idx + 1}_${Date.now()}`,
            text: text.trim(),
            votes: prevOpt?.votes || 0,
          };
        });

        await updateDoc(doc(db, "polls", editingPollId), {
          question: pollQuestion.trim(),
          status: pollStatus,
          options: updatedOptions,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const newPollRef = doc(collection(db, "polls"));
        const newOptions = cleanOptions.map((text, idx) => ({
          id: `opt_${idx + 1}_${Date.now()}`,
          text: text.trim(),
          votes: 0,
        }));

        await setDoc(newPollRef, {
          id: newPollRef.id,
          question: pollQuestion.trim(),
          status: pollStatus,
          options: newOptions,
          totalVotes: 0,
          createdAt: new Date().toISOString(),
        });
      }

      setPollModalOpen(false);
    } catch (err) {
      console.error("Error saving poll:", err);
      alert("Failed to save poll. Check console.");
    } finally {
      setIsSavingPoll(false);
    }
  }, [pollQuestion, pollOptions, pollStatus, editingPollId, pollsList]);

  const handleTogglePollStatus = useCallback(async (poll: any) => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const nextStatus = poll.status === "active" ? "closed" : "active";
      await updateDoc(doc(db, "polls", poll.id), { status: nextStatus });
    } catch (err) {
      console.error("Error updating poll status:", err);
    }
  }, []);

  const handleDeletePoll = useCallback((poll: any) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete poll permanently?",
      description: (
        <p>
          This will permanently delete the poll <strong>&quot;{poll.question}&quot;</strong> and all
          associated votes. This action cannot be undone.
        </p>
      ),
      confirmLabel: "Delete Poll",
      onConfirm: async () => {
        try {
          const { doc, deleteDoc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "polls", poll.id));
        } catch (err) {
          console.error("Error deleting poll:", err);
        }
      },
    });
  }, []);

  const handleResetAllPollVotes = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: "Reset All Poll Votes to 0?",
      description: (
        <div>
          <p className="text-rose-300 font-bold mb-2">⚠️ RESET ALL LIVE POLL VOTES:</p>
          <p>
            This action will reset the vote counts and team vote percentages across all active and saved polls in the <code className="text-violet-300">polls</code> collection to 0.
          </p>
          <p className="text-xs text-slate-400 font-semibold pt-2">
            All option vote tallies will be cleared. Proceed?
          </p>
        </div>
      ),
      confirmLabel: "Reset All Poll Votes",
      onConfirm: async () => {
        try {
          const { collection, getDocs, doc, setDoc } = await import("firebase/firestore");
          const pollSnap = await getDocs(collection(db, "polls"));

          if (pollSnap.empty) {
            alert("No active polls found in database to reset.");
            return;
          }

          for (const pollDoc of pollSnap.docs) {
            const data = pollDoc.data();
            const resetOptions = (data.options || []).map((opt: any) => ({
              ...opt,
              votes: 0,
              teamVotes: { "Team A": 0, "Team B": 0 },
            }));
            await setDoc(
              doc(db, "polls", pollDoc.id),
              { options: resetOptions, totalVotes: 0, updatedAt: new Date().toISOString() },
              { merge: true }
            );
          }

          alert("✅ Successfully reset all poll votes to 0!");
        } catch (err: any) {
          console.error("Error resetting poll votes:", err);
          alert(`❌ Failed to reset poll votes: ${err.message}`);
        }
      },
    });
  }, []);

  // PARTICIPANT HANDLERS
  const handleOpenParticipantModal = useCallback((participant?: ParticipantItem) => {
    if (participant) {
      setEditingParticipantId(participant.id);
      setEditParticipantName(participant.fullName || participant.name || "");
      setEditParticipantReg(participant.registrationNumber || participant.id || "");
      setEditParticipantScore(participant.totalScore || 0);
    } else {
      setEditingParticipantId(null);
      setEditParticipantName("");
      setEditParticipantReg("");
      setEditParticipantScore(0);
    }
    setParticipantModalOpen(true);
  }, []);

  const handleSaveParticipant = useCallback(async () => {
    if (!editParticipantReg.trim() || !editParticipantName.trim()) {
      alert("Please provide both Name and Registration Number.");
      return;
    }

    const normalizedReg = editParticipantReg.trim().toUpperCase();
    const normalizedName = editParticipantName.trim();

    setIsSavingParticipant(true);
    try {
      const { doc, setDoc, deleteDoc, getDoc } = await import("firebase/firestore");

      if (editingParticipantId) {
        if (editingParticipantId !== normalizedReg) {
          const oldDocRef = doc(db, "participants", editingParticipantId);
          const oldDocSnap = await getDoc(oldDocRef);
          const oldData = oldDocSnap.exists() ? oldDocSnap.data() : {};

          await setDoc(doc(db, "participants", normalizedReg), {
            ...oldData,
            registrationNumber: normalizedReg,
            fullName: normalizedName,
            totalScore: Number(editParticipantScore) || 0,
            updatedAt: new Date().toISOString(),
          });

          await deleteDoc(oldDocRef);
        } else {
          await setDoc(
            doc(db, "participants", editingParticipantId),
            {
              fullName: normalizedName,
              registrationNumber: normalizedReg,
              totalScore: Number(editParticipantScore) || 0,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } else {
        await setDoc(doc(db, "participants", normalizedReg), {
          registrationNumber: normalizedReg,
          fullName: normalizedName,
          totalScore: Number(editParticipantScore) || 0,
          registeredAt: new Date().toISOString(),
        });
      }

      setParticipantModalOpen(false);
    } catch (err) {
      console.error("Error saving participant:", err);
      alert("Failed to save participant document. Check console.");
    } finally {
      setIsSavingParticipant(false);
    }
  }, [editParticipantReg, editParticipantName, editParticipantScore, editingParticipantId]);

  const handleDeleteParticipant = useCallback((participantId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete participant permanently?",
      description: (
        <p>
          This will permanently delete participant entry <strong>&quot;{name || participantId}&quot;</strong> (
          {participantId}). This action cannot be undone.
        </p>
      ),
      confirmLabel: "Delete Participant",
      onConfirm: async () => {
        try {
          const { doc, deleteDoc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "participants", participantId));
        } catch (err) {
          console.error("Error deleting participant:", err);
          alert("Failed to delete participant entry.");
        }
      },
    });
  }, []);

  // RANDOM PLAYER SELECTOR HANDLERS FOR TEAM A AND TEAM B
  const handlePickRandomPlayer = useCallback((team: "Team A" | "Team B") => {
    if (participantsList.length === 0) {
      alert("No registered participants found in the database!");
      return;
    }

    // Filter available pool:
    // 1. Exclude the currently picked player in either slot so no player is chosen twice
    // 2. Exclude players already assigned to the opposite team in DB
    const availablePool = participantsList.filter((p) => {
      if (selectedTeamAPlayer && p.id === selectedTeamAPlayer.id) return false;
      if (selectedTeamBPlayer && p.id === selectedTeamBPlayer.id) return false;

      // If participant has a team assigned in DB, make sure it's not the opposite team
      const oppositeTeam = team === "Team A" ? "Team B" : "Team A";
      if (p.team && p.team === oppositeTeam) return false;

      return true;
    });

    if (availablePool.length === 0) {
      alert(`No unassigned participants available for ${team}!`);
      return;
    }

    // Pick final player upfront so shuffle ends on a guaranteed valid unique player
    const finalIndex = Math.floor(Math.random() * availablePool.length);
    const finalPicked = availablePool[finalIndex];

    if (team === "Team A") {
      setIsSelectingTeamA(true);
    } else {
      setIsSelectingTeamB(true);
    }

    // Slot machine random shuffle effect
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count >= 15) {
        clearInterval(interval);
        if (team === "Team A") {
          setSelectedTeamAPlayer(finalPicked);
          setIsSelectingTeamA(false);
        } else {
          setSelectedTeamBPlayer(finalPicked);
          setIsSelectingTeamB(false);
        }
      } else {
        const randomIndex = Math.floor(Math.random() * availablePool.length);
        const randomPicked = availablePool[randomIndex];
        if (team === "Team A") {
          setSelectedTeamAPlayer(randomPicked);
        } else {
          setSelectedTeamBPlayer(randomPicked);
        }
      }
    }, 80);
  }, [participantsList, selectedTeamAPlayer, selectedTeamBPlayer]);

  const handleAssignTeam = useCallback(async (player: ParticipantItem, teamName: "Team A" | "Team B") => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(
        doc(db, "participants", player.id),
        { team: teamName, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.error("Error assigning team:", err);
      alert("Failed to assign team in Firestore.");
    }
  }, []);

  // EVENT HANDLERS
  const handleOpenEventModal = useCallback((evt?: any) => {
    if (evt) {
      setEditingEventId(evt.id);
      setEventTitle(evt.title || "");
      setEventCategory(evt.category || "Esports Tournament");
      setEventStatus(evt.status || "live");
      setEventDescription(evt.description || "");
      setEventVenue(evt.venue || evt.location || "");
      setEventDate(evt.date || "");
      setEventFee(String(evt.fee ?? 0));
      setEventOriginalFee(evt.originalFee !== undefined ? String(evt.originalFee) : "100");
    } else {
      setEditingEventId(null);
      setEventTitle("");
      setEventCategory("Esports Tournament");
      setEventStatus("live");
      setEventDescription("");
      setEventVenue("");
      setEventDate("");
      setEventFee("0");
      setEventOriginalFee("100");
    }
    setEventModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async () => {
    if (!eventTitle.trim()) {
      alert("Please enter an event title.");
      return;
    }

    setIsSavingEvent(true);
    try {
      const { doc, setDoc, updateDoc } = await import("firebase/firestore");
      const feeNum = Number(eventFee) || 0;
      const origFeeNum = eventOriginalFee !== "" ? Number(eventOriginalFee) : undefined;
      const venueStr = eventVenue.trim();

      if (editingEventId) {
        await updateDoc(doc(db, "events", editingEventId), {
          title: eventTitle.trim(),
          category: eventCategory,
          status: eventStatus,
          description: eventDescription.trim(),
          venue: venueStr,
          location: venueStr,
          fee: feeNum,
          originalFee: origFeeNum,
          date: eventDate,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const newEvtRef = doc(collection(db, "events"));
        await setDoc(newEvtRef, {
          id: newEvtRef.id,
          title: eventTitle.trim(),
          category: eventCategory,
          status: eventStatus,
          description: eventDescription.trim(),
          venue: venueStr,
          location: venueStr,
          fee: feeNum,
          originalFee: origFeeNum,
          date: eventDate,
          createdAt: new Date().toISOString(),
        });
      }

      setEventModalOpen(false);
    } catch (err) {
      console.error("Error saving event:", err);
      alert("Failed to save event.");
    } finally {
      setIsSavingEvent(false);
    }
  }, [eventTitle, eventCategory, eventStatus, eventDescription, eventVenue, eventDate, eventFee, eventOriginalFee, editingEventId]);

  const handleToggleEventStatus = useCallback(async (evt: any) => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const nextStatus = evt.status === "live" || evt.status === "active" ? "upcoming" : "live";
      await updateDoc(doc(db, "events", evt.id), { status: nextStatus });
    } catch (err) {
      console.error("Error updating event status:", err);
    }
  }, []);

  const handleTogglePresence = useCallback(async (docId: string, currentPresence: boolean) => {
    setTogglingPresenceId(docId);
    try {
      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "event_registrations", docId), {
        is_present: !currentPresence,
        updated_at: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to update attendance status:", err);
    } finally {
      setTogglingPresenceId(null);
    }
  }, []);

  const handleRemoveRegistrant = useCallback(async (docId: string) => {
    if (!confirm("Remove this registrant? This will free up a seat.")) return;
    setRemovingRegistrantId(docId);
    try {
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "event_registrations", docId));
    } catch (err) {
      console.error("Failed to remove registrant:", err);
    } finally {
      setRemovingRegistrantId(null);
    }
  }, []);

  const handleExportCSV = useCallback((eventId: string) => {
    const list = adminRegistrants[eventId] || [];
    if (list.length === 0) {
      alert("No registrants to export.");
      return;
    }
    const eventTitle = eventsList.find((e) => e.id === eventId)?.title || "event";
    const header = ["S.No", "Full Name", "Registration Number", "Email", "Phone", "Branch", "Attendance Status"];
    const rows = list.map((r, i) => [
      i + 1,
      `"${r.full_name}"`,
      `"${r.registration_number}"`,
      `"${r.user_email}"`,
      `"${r.phone || ""}"`,
      `"${r.branch || ""}"`,
      r.is_present ? "Present" : "Absent",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [header.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${eventTitle.replace(/[^a-zA-Z0-9]/g, "_")}_registrants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [adminRegistrants, eventsList]);

  const handleDeleteEvent = useCallback((evt: any) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete event permanently?",
      description: (
        <p>
          This will permanently delete event <strong>&quot;{evt.title}&quot;</strong> and all associated data.
          This action cannot be undone.
        </p>
      ),
      confirmLabel: "Delete Event",
      onConfirm: async () => {
        try {
          const { doc, deleteDoc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "events", evt.id));
        } catch (err) {
          console.error("Error deleting event:", err);
        }
      },
    });
  }, []);

  if (loading || !user || !isAdmin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#06070a",
          color: "#a78bfa",
          fontSize: "1.1rem",
          fontWeight: 600,
        }}
      >
        🔒 Verifying Admin Authorization...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% -10%, rgba(124, 58, 237, 0.15), transparent 60%), radial-gradient(ellipse at 80% 110%, rgba(59, 130, 246, 0.1), transparent 60%), #06070a",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top Navbar */}
      <header className="min-h-[64px] sm:h-[72px] border-b border-violet-500/25 bg-[#0a0d18]/85 backdrop-blur-2xl px-4 sm:px-9 flex items-center justify-between sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(124,58,237,0.1)] flex-wrap gap-2 py-2 sm:py-0">
        <Link href="/" className="flex items-center gap-3.5 hover:opacity-90 transition-opacity no-underline">
          <Image
            src="/logo.png"
            alt="VRGC Logo"
            width={55}
            height={32}
            style={{ objectFit: "contain" }}
            priority
          />
          <div>
            <div className="group relative flex items-center justify-center rounded-full px-3.5 py-1 border border-violet-500/30 bg-slate-950/60">
              <AnimatedGradientText className="text-sm font-extrabold tracking-wide">
                VRGC · VIT Bhopal
              </AnimatedGradientText>
            </div>
            <span
              style={{
                fontSize: "0.72rem",
                color: "#a78bfa",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                display: "block",
                marginTop: "2px",
                textAlign: "left",
              }}
            >
              IceBreaking 2026 Dashboard
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
          {/* User Profile Avatar & Info */}
          <div className="flex items-center gap-2 sm:gap-3 bg-[#0f1423]/60 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full border border-violet-500/25">
            <Avatar className="w-7 h-7 sm:w-10 sm:h-10">
              <AvatarImage
                src={user?.photoURL || undefined}
                alt={user?.displayName || "Admin Avatar"}
              />
              <AvatarFallback className="bg-violet-900 text-violet-200 font-bold text-xs sm:text-base">
                {(user?.displayName || user?.email || "A").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="text-left hidden xs:block sm:block">
              <p className="m-0 text-xs sm:text-sm font-extrabold text-slate-100 leading-tight">
                {user?.displayName
                  ? user.displayName.replace(/\b[0-9]{2}[A-Za-z]{3}[0-9]{5}\b/gi, "").trim()
                  : "Admin User"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold text-[10px] px-1.5 py-0">
                  👑 Superadmin
                </Badge>
              </div>
            </div>
          </div>

          <button
            onClick={async () => {
              await signOut(auth);
              router.push("/admin-panel/login");
            }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-red-500/15 text-red-300 border border-red-500/30 rounded-xl cursor-pointer hover:bg-red-500/30 hover:text-white transition-all shadow-sm"
          >
            🚪 Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row min-h-[calc(100vh-72px)]">
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-violet-500/20 bg-slate-950/80 md:bg-slate-950/40 backdrop-blur-2xl p-3 md:p-5 flex flex-col gap-2 shrink-0 sticky top-[64px] sm:top-[72px] z-40">
          <div className="md:hidden relative w-full">
            <label className="text-[10px] uppercase font-bold text-violet-400 tracking-wider mb-1 block px-1">
              Navigate Section
            </label>
            <div className="relative">
              <select
                value={activeTab}
                onChange={(e) => {
                  const selectedVal = e.target.value;
                  if (selectedVal === "leaderboard") {
                    window.open("/leaderboard", "_blank");
                  } else {
                    setActiveTab(selectedVal as any);
                  }
                }}
                className="w-full appearance-none bg-slate-900/90 border border-violet-400/50 text-white text-xs font-bold py-3 pl-3.5 pr-10 rounded-xl outline-none backdrop-blur-xl shadow-lg focus:ring-2 focus:ring-violet-500 min-h-[44px]"
              >
                <option value="overview">📊 Overview</option>
                <option value="leaderboard">🏆 Live Leaderboard ↗ (Opens New Tab)</option>
                <option value="events">🎮 Manage Events</option>
                <option value="proposals">📅 Future Proposals</option>
                <option value="polls">📊 Manage Polls</option>
                <option value="quizzes">🧠 Live Quiz Control</option>
                <option value="users">👥 Participants</option>
                <option value="tools">⚙️ Database Tools</option>
              </select>
              <ChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none"
                size={16}
              />
            </div>
          </div>

          <div className="hidden md:flex flex-col gap-2 w-full">
            {[
              { id: "overview", label: "📊 Overview" },
              { id: "leaderboard", label: "🏆 Live Leaderboard ↗", external: true },
              { id: "events", label: "🎮 Manage Events" },
              { id: "proposals", label: "📅 Future Proposals" },
              { id: "polls", label: "📊 Manage Polls" },
              { id: "quizzes", label: "🧠 Live Quiz Control" },
              { id: "users", label: "👥 Participants" },
              { id: "tools", label: "⚙️ Database Tools" },
            ].map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.external) {
                      window.open("/leaderboard", "_blank");
                    } else {
                      setActiveTab(item.id as any);
                    }
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-between min-h-[44px] ${isActive
                    ? "bg-gradient-to-r from-violet-600/30 to-indigo-600/20 border border-violet-400/40 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
                    }`}
                >
                  <span>{item.label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-4 border-t border-white/[0.08] hidden md:block">
            <Link
              href="/"
              className="text-violet-400 hover:text-violet-300 text-xs font-bold flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <span>← Return to Main Site</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 md:p-11 max-w-[1250px] w-full mx-auto">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div>
              <h1 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "6px", letterSpacing: "-0.02em" }}>Dashboard Overview</h1>
              <p style={{ color: "#94a3b8", fontSize: "0.98rem", marginBottom: "36px" }}>
                Real-time operational metrics & platform controls for IceBreaking 2026.
              </p>

              {/* Event Registration Status Control Banner */}
              <Card className={`${registrationOpen ? "bg-emerald-950/20 border-emerald-500/30" : "bg-red-950/20 border-red-500/30"} shadow-xl mb-8 border backdrop-blur-xl`}>
                <CardContent className="p-6 flex flex-row items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-base font-black text-white">
                        📝 Event Registration Status:
                      </span>
                      <Badge className={registrationOpen ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold px-3 py-0.5 text-xs" : "bg-red-500/20 text-red-300 border-red-500/40 font-bold px-3 py-0.5 text-xs"}>
                        {registrationOpen ? "🟢 OPEN (Public Can Register)" : "🔒 CLOSED (Registration Locked)"}
                      </Badge>
                    </div>
                    <p className="text-slate-300 text-xs font-medium m-0">
                      {registrationOpen
                        ? "Users on the home page can click 'Register Now' to submit their details."
                        : "The home page will display '🔒 Registration is currently closed.'"}
                    </p>
                  </div>

                  <button
                    onClick={handleToggleRegistration}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-lg text-white ${registrationOpen ? "bg-red-600 hover:bg-red-500 shadow-red-600/30" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"}`}
                  >
                    {registrationOpen ? "🔒 Close Registration" : "🟢 Open Registration"}
                  </button>
                </CardContent>
              </Card>

              {/* Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "22px", marginBottom: "40px" }}>
                {[
                  { label: "Total Participants", value: stats.totalUsers || participantsList.length, color: "#818cf8", accent: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
                  { label: "Active Events", value: eventsList.length, color: "#38bdf8", accent: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
                  { label: "Active Polls", value: pollsList.length, color: "#fbbf24", accent: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
                  { label: "Active Quizzes", value: quizData.length, color: "#c084fc", accent: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
                  { label: "System Admins", value: stats.activeAdmins || 2, color: "#34d399", accent: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
                ].map((card, idx) => (
                  <Card key={idx} className="bg-white/[0.02] border-white/[0.08] shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl relative overflow-hidden transition-all duration-300 hover:border-violet-400/50 hover:shadow-[0_0_25px_rgba(139,92,246,0.15)] ring-1 ring-white/[0.04]">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-slate-400 font-bold text-xs uppercase tracking-wider">{card.label}</CardDescription>
                      <CardTitle className="text-3xl font-black text-white" style={{ color: card.color }}>
                        {card.value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-4">
                      <Badge variant="outline" className={`${card.accent} font-bold text-[11px] px-2.5 py-0.5`}>
                        Live System Data
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Registered System Admins Box */}
              <Card className="bg-white/[0.02] border-white/[0.08] shadow-2xl p-6 backdrop-blur-2xl ring-1 ring-white/[0.04]">
                <CardHeader className="px-0 pt-0 pb-6 border-b border-white/[0.08] flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black text-white">Registered Superadmins</CardTitle>
                    <CardDescription className="text-slate-400 mt-1 text-sm">Verified administrator roster with full system privileges.</CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-violet-500/15 text-violet-300 border-violet-500/40 px-3.5 py-1 font-bold text-xs">
                    🛡️ 2 Active Admins
                  </Badge>
                </CardHeader>

                <CardContent className="px-0 pt-6">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                    {[
                      { name: "Jaiyansh Dhaulakhandi", role: "Superadmin", initial: "J", bg: "from-violet-600 to-indigo-900" },
                      { name: "Abhinav Mishra", role: "Superadmin", initial: "A", bg: "from-blue-600 to-indigo-900" },
                    ].map((admin, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-400/40 transition-all shadow-lg backdrop-blur-md"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className={`bg-gradient-to-br ${admin.bg} text-white font-black text-lg border border-white/20`}>
                              {admin.initial}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <strong className="text-base font-black text-white block">{admin.name}</strong>
                          </div>
                        </div>

                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-extrabold px-3 py-1 text-xs">
                          👑 {admin.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* LEADERBOARD TAB */}
          {activeTab === "leaderboard" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0">Live Standings Leaderboard</h1>
                  <p className="text-slate-400 text-xs font-semibold mt-1">
                    Realtime participant rankings with assigned team breakdown.
                  </p>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-4 sm:p-6 backdrop-blur-2xl shadow-xl space-y-3">
                {participantsList
                  .slice()
                  .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
                  .map((u, idx) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-400/40 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-black text-xs text-purple-300">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-white m-0 leading-snug">
                              {u.fullName || u.name || "Participant"}
                            </h4>
                            {u.team && (
                              <Badge className={u.team === "Team A" ? "bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px]" : "bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px]"}>
                                {u.team}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] sm:text-xs font-mono text-violet-400 font-semibold block mt-0.5">
                            Reg #: {u.registrationNumber || u.id}
                          </span>
                        </div>
                      </div>

                      <Badge className="bg-sky-500/15 text-sky-300 border-sky-500/30 font-black text-xs px-3 py-1">
                        ⭐ {u.totalScore || 0} PTS
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* EVENTS TAB */}
          {activeTab === "events" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0">Manage Events &amp; Tournaments</h1>
                  <p className="text-slate-400 text-xs font-semibold mt-1">
                    View, create, edit, manage capacity, and track attendance for IceBreaking &amp; VRGC events.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenEventModal()}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer min-h-[44px]"
                >
                  ➕ Create New Event
                </button>
              </div>

              <div className="grid gap-4">
                {eventsList.length > 0 ? (
                  eventsList.map((evt: any) => {
                    const regCount = registrationCounts[evt.id] || 0;
                    const seatsLeft = Math.max(0, SEAT_LIMIT - regCount);
                    const fillPct = Math.min(100, (regCount / SEAT_LIMIT) * 100);
                    const isFull = seatsLeft === 0;
                    const hasOffer = evt.originalFee && evt.originalFee > (evt.fee ?? 0);
                    const savings = hasOffer ? evt.originalFee - (evt.fee ?? 0) : 0;
                    const discountPct = hasOffer ? Math.round((savings / evt.originalFee) * 100) : 0;

                    return (
                      <Card
                        key={evt.id}
                        className="bg-slate-950/80 border-slate-800/80 shadow-xl backdrop-blur-xl transition-colors hover:border-violet-500/40 p-4 sm:p-6 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className="bg-violet-500/10 text-violet-400 border-violet-500/30 font-extrabold text-[10px] sm:text-[11px] px-2.5 py-0.5"
                              >
                                {evt.category || "Tournament"}
                              </Badge>
                              <Badge
                                className={
                                  evt.status === "live" || evt.status === "active"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-black text-[10px] sm:text-[11px]"
                                    : "bg-slate-800 text-slate-400 border-slate-700 font-bold text-[10px] sm:text-[11px]"
                                }
                              >
                                ● {(evt.status || "upcoming").toUpperCase()}
                              </Badge>

                              {/* Price badge */}
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                                {hasOffer && (
                                  <span className="text-slate-400 line-through text-[9px]">₹{evt.originalFee}</span>
                                )}
                                <span>{evt.fee === 0 || !evt.fee ? "FREE" : `₹${evt.fee}`}</span>
                                {hasOffer && (
                                  <span className="text-[9px] text-emerald-300 font-extrabold bg-emerald-500/20 px-1 rounded">
                                    {discountPct}% OFF
                                  </span>
                                )}
                              </div>
                            </div>

                            <h3 className="m-0 text-base sm:text-xl font-black text-white">{evt.title}</h3>
                            {evt.description && (
                              <p className="m-0 text-slate-400 text-xs sm:text-sm leading-relaxed">{evt.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-slate-300 font-semibold flex-wrap">
                              {evt.date && <span>📅 {evt.date}</span>}
                              {(evt.venue || evt.location) && <span>📍 {evt.venue || evt.location}</span>}
                            </div>

                            {/* Capacity Progress Bar */}
                            <div className="space-y-1.5 pt-1 max-w-md">
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <span>
                                  Seats: <strong className="text-white">{regCount}</strong> / {SEAT_LIMIT}
                                </span>
                                <span className={seatsLeft <= 10 ? "text-rose-400 font-bold" : "text-amber-300"}>
                                  {isFull ? "Full" : `${seatsLeft} seats left`}
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isFull
                                      ? "bg-rose-500"
                                      : fillPct > 75
                                      ? "bg-amber-500"
                                      : "bg-gradient-to-r from-violet-500 to-cyan-400"
                                  }`}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap self-start">
                            <button
                              onClick={() => setAdminPanelEventId(evt.id)}
                              className="px-3 py-2 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 hover:bg-violet-600/30 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                            >
                              <Users size={14} />
                              Registrants ({regCount})
                            </button>
                            <button
                              onClick={() => handleToggleEventStatus(evt)}
                              className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold text-xs transition-colors text-center cursor-pointer min-h-[44px]"
                            >
                              {evt.status === "live" || evt.status === "active" ? "Pause/Upcoming" : "Set Live"}
                            </button>
                            <button
                              onClick={() => handleOpenEventModal(evt)}
                              className="px-3 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(evt)}
                              className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                ) : (
                  <Card className="bg-slate-950/60 border-dashed border-slate-800 p-10 text-center">
                    <p style={{ color: "#94a3b8", fontSize: "1rem", margin: "0 0 16px" }}>No events found in database.</p>
                    <button
                      onClick={() => handleOpenEventModal()}
                      className="bg-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer min-h-[44px]"
                    >
                      Create First Event
                    </button>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* PROPOSALS & FACULTY DESK TAB */}
          {activeTab === "proposals" && (
            <div className="space-y-6">
              <PlannedEvents
                isAdmin={true}
                userEmail={user?.email || undefined}
                userName={user?.displayName || undefined}
              />
            </div>
          )}

          {/* POLLS TAB */}
          {activeTab === "polls" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0">Polls Management</h1>
                  <p className="text-slate-400 text-xs font-semibold mt-1">
                    Create, edit, toggle active status, or delete audience polls.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleResetAllPollVotes}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 min-h-[44px]"
                  >
                    <Trash2 size={14} />
                    Reset All Poll Votes
                  </button>
                  <button
                    onClick={() => handleOpenPollModal()}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer min-h-[44px]"
                  >
                    ➕ Create New Poll
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                {pollsList.length > 0 ? (
                  pollsList.map((poll) => {
                    const totalVotes = poll.options
                      ? poll.options.reduce((sum: number, o: any) => sum + (o.votes || 0), 0)
                      : poll.totalVotes || 0;

                    return (
                      <Card
                        key={poll.id}
                        className="bg-slate-950/80 border-slate-800/80 shadow-xl backdrop-blur-xl transition-colors hover:border-violet-500/40 p-4 sm:p-6"
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                className={
                                  poll.status === "active"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-black text-[10px] sm:text-[11px]"
                                    : "bg-red-500/15 text-red-400 border-red-500/30 font-black text-[10px] sm:text-[11px]"
                                }
                              >
                                {poll.status === "active" ? "🟢 Active Poll" : "🔴 Closed"}
                              </Badge>
                              <span className="text-xs text-slate-400 font-bold">Total Votes: {totalVotes}</span>
                              {(() => {
                                let sumA = 0;
                                let sumB = 0;
                                poll.options?.forEach((o: any) => {
                                  sumA += o.teamVotes?.["Team A"] || 0;
                                  sumB += o.teamVotes?.["Team B"] || 0;
                                });
                                const grandTotal = sumA + sumB;
                                if (grandTotal === 0) return null;
                                const pA = Math.round((sumA / grandTotal) * 100);
                                const pB = Math.round((sumB / grandTotal) * 100);
                                return (
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold text-[10px] px-2 py-0.5">
                                      ⚔️ Team A: {pA}% ({sumA})
                                    </Badge>
                                    <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold text-[10px] px-2 py-0.5">
                                      🛡️ Team B: {pB}% ({sumB})
                                    </Badge>
                                  </div>
                                );
                              })()}
                            </div>
                            <h3 className="m-0 text-base sm:text-xl font-black text-white">{poll.question}</h3>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                            <button
                              onClick={() => handleTogglePollStatus(poll)}
                              className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold text-xs transition-colors text-center cursor-pointer min-h-[44px]"
                            >
                              {poll.status === "active" ? "Pause/Close" : "Set Active"}
                            </button>
                            <button
                              onClick={() => handleOpenPollModal(poll)}
                              className="px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeletePoll(poll)}
                              className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>

                        {/* Bar Graph Breakdown */}
                        <div className="space-y-3 mt-4 pt-4 border-t border-white/[0.08]">
                          {poll.options?.map((opt: any, idx: number) => {
                            const votes = opt.votes || 0;
                            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                            const currentGradient = BAR_GRADIENTS[idx % BAR_GRADIENTS.length];

                            return (
                              <div
                                key={idx}
                                className="bg-slate-900/80 p-3 rounded-2xl border border-white/[0.08]"
                              >
                                <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                                  <span className="text-white flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] text-violet-300">
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span>{opt.text}</span>
                                  </span>
                                  <span className="text-slate-400 text-xs font-semibold">
                                    {votes} votes ({percentage}%)
                                  </span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-950/80 overflow-hidden border border-white/[0.06] flex w-full relative">
                                  {(() => {
                                    const tA = opt.teamVotes?.["Team A"] || 0;
                                    const tB = opt.teamVotes?.["Team B"] || 0;
                                    const sumTeam = tA + tB;
                                    const pA = sumTeam > 0 ? Math.round((tA / sumTeam) * 100) : 0;
                                    const pB = sumTeam > 0 ? Math.round((tB / sumTeam) * 100) : 0;

                                    if (sumTeam > 0 && percentage > 0) {
                                      return (
                                        <>
                                          {pA > 0 && (
                                            <div
                                              className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 rounded-l-full transition-[width] duration-700 ease-out"
                                              style={{ width: `${(pA / 100) * percentage}%` }}
                                            />
                                          )}
                                          {pB > 0 && (
                                            <div
                                              className={`h-full bg-gradient-to-r from-sky-500 to-blue-600 ${pA === 0 ? "rounded-l-full" : ""} rounded-r-full transition-[width] duration-700 ease-out`}
                                              style={{ width: `${(pB / 100) * percentage}%` }}
                                            />
                                          )}
                                        </>
                                      );
                                    }
                                    return (
                                      <div
                                        className={`h-full bg-gradient-to-r ${currentGradient} rounded-full transition-[width] duration-700 ease-out`}
                                        style={{
                                          width: `${percentage}%`,
                                        }}
                                      />
                                    );
                                  })()}
                                </div>

                                {/* Team Vote Breakdown Badges with Percentages */}
                                {((opt.teamVotes?.["Team A"] || 0) > 0 || (opt.teamVotes?.["Team B"] || 0) > 0) && (() => {
                                  const tA = opt.teamVotes?.["Team A"] || 0;
                                  const tB = opt.teamVotes?.["Team B"] || 0;
                                  const total = tA + tB;
                                  const pA = total > 0 ? Math.round((tA / total) * 100) : 0;
                                  const pB = total > 0 ? Math.round((tB / total) * 100) : 0;
                                  return (
                                    <div className="flex items-center gap-2 mt-2 text-[11px]">
                                      <span className="text-slate-400 font-medium">Team Distribution:</span>
                                      {tA > 0 && (
                                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] px-2 py-0">
                                          ⚔️ Team A: {pA}% ({tA})
                                        </Badge>
                                      )}
                                      {tB > 0 && (
                                        <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] px-2 py-0">
                                          🛡️ Team B: {pB}% ({tB})
                                        </Badge>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })
                ) : (
                  <Card className="bg-slate-950/60 border-dashed border-slate-800 p-10 text-center">
                    <p style={{ color: "#94a3b8", fontSize: "1rem", margin: "0 0 16px" }}>No active or created polls yet.</p>
                    <button
                      onClick={() => handleOpenPollModal()}
                      className="bg-violet-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer min-h-[44px]"
                    >
                      Create First Poll
                    </button>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* LIVE QUIZ CONTROL SYSTEM TAB */}
          {activeTab === "quizzes" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0 flex items-center gap-2">
                    <Brain className="text-purple-400" size={26} />
                    <span>Live Quiz Control & Real-time Analytics</span>
                  </h1>
                  <p className="text-slate-400 text-xs font-semibold mt-1">
                    Control active question states live across all participant screens with real-time response analytics.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleNextQuestion}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    <span>Next Question</span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={handleActivateAllQuestions}
                    className="px-3.5 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
                  >
                    ⚡ Activate All (15)
                  </button>
                  <button
                    onClick={handleDeactivateAllQuestions}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
                  >
                    🛑 Deactivate All
                  </button>
                  <button
                    onClick={handleResetQuizResponses}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 min-h-[40px]"
                  >
                    <Trash2 size={14} />
                    Reset All Answers
                  </button>
                </div>
              </div>

              {/* GLOBAL QUIZ CONTROLS & MODE SELECTOR */}
              <Card className="bg-slate-950/80 border-slate-800/80 shadow-xl backdrop-blur-xl p-5 sm:p-6 space-y-4">
                {/* PROMINENT LIVE QUESTION INDICATOR BOX */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-slate-950 border border-purple-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 font-black text-xl shadow-lg shadow-purple-600/20 shrink-0">
                      {activeQuestionIds.length > 0 ? `#${activeQuestionIds[0]}` : "—"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wider font-extrabold text-purple-400">Current Live Question:</span>
                        <Badge className={activeQuestionIds.length > 0 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]" : "bg-slate-800 text-slate-400 border-slate-700 text-[10px]"}>
                          {activeQuestionIds.length > 0 ? "🟢 LIVE ON SCREENS" : "⚪ NO QUESTION ACTIVE"}
                        </Badge>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-white m-0 mt-0.5">
                        {activeQuestionIds.length > 0
                          ? quizData.find((q) => q.id === activeQuestionIds[0])?.question || `Question #${activeQuestionIds[0]}`
                          : "No active question selected. Click 'Next Question' or activate a question below."}
                      </h4>
                    </div>
                  </div>

                  <button
                    onClick={handleNextQuestion}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer shrink-0 min-h-[44px]"
                  >
                    <span>Next Question</span>
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">Global Arena Quiz Switch:</span>
                      <Badge className={globalQuizOpen ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"}>
                        {globalQuizOpen ? "🟢 QUIZ ARENA OPEN" : "🔒 QUIZ ARENA CLOSED"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Active Questions: <strong className="text-purple-300 font-extrabold">{activeQuestionIds.length}</strong> of 15 Live
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
                    {/* Mode Selector */}
                    <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
                      <button
                        onClick={() => handleSetQuizMode("single")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${quizMode === "single"
                          ? "bg-purple-600 text-white shadow-md"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        Single Question Mode
                      </button>
                      <button
                        onClick={() => handleSetQuizMode("multiple")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${quizMode === "multiple"
                          ? "bg-purple-600 text-white shadow-md"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        Multiple Active Mode
                      </button>
                    </div>

                    <button
                      onClick={handleToggleGlobalQuiz}
                      className={`px-5 py-2.5 rounded-xl font-black text-xs transition-colors shadow-lg cursor-pointer min-h-[40px] ${globalQuizOpen
                        ? "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                        }`}
                    >
                      {globalQuizOpen ? "🔒 Lock Quiz Arena" : "🔓 Open Quiz Arena"}
                    </button>
                  </div>
                </div>
              </Card>

              {/* HARDCODED QUIZ QUESTION ROSTER & REAL-TIME ANALYTICS */}
              <div className="grid gap-5">
                {quizData.map((q: QuizQuestion) => {
                  const isActive = activeQuestionIds.includes(q.id);
                  const responses = quizResponses[q.id] || {};
                  const responseEntries = Object.entries(responses);
                  const totalResponses = responseEntries.length;

                  // Option-wise tally
                  const optionCounts = q.options.map((_, optIdx) => {
                    return responseEntries.filter(([, selectedIdx]) => selectedIdx === optIdx).length;
                  });

                  // Correct answers tally & accuracy
                  const correctCount = responseEntries.filter(([, selectedIdx]) => selectedIdx === q.correctAnswerIndex).length;
                  const accuracyPct = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;
                  const unansweredCount = Math.max(0, (stats.totalUsers || participantsList.length) - totalResponses);

                  const isExpanded = Boolean(expandedDetails[q.id]);

                  return (
                    <Card
                      key={q.id}
                      className={`bg-slate-950/80 backdrop-blur-xl transition-colors p-5 sm:p-6 border ${isActive ? "border-purple-500/50 ring-1 ring-purple-500/20" : "border-slate-800/80 opacity-90"
                        }`}
                    >
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-black text-xs">
                              Question #{q.id}
                            </Badge>
                            <Badge className={isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold text-xs" : "bg-slate-800 text-slate-400 border-slate-700 font-bold text-xs"}>
                              {isActive ? "🟢 ACTIVE ON USER SCREENS" : "⚪ INACTIVE / HIDDEN"}
                            </Badge>
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 font-bold text-xs">
                              🏆 {q.points} PTS
                            </Badge>
                          </div>
                          <h3 className="m-0 text-base sm:text-lg font-black text-white leading-snug">
                            {q.question}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap shrink-0">
                          <button
                            onClick={() => handleToggleQuestionActive(q.id)}
                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs transition-colors text-center cursor-pointer min-h-[44px] ${isActive
                              ? "bg-slate-900 border border-slate-800 hover:border-slate-700 text-rose-300"
                              : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30"
                              }`}
                          >
                            {isActive ? "🛑 Deactivate Q#" + q.id : "⚡ Activate Q#" + q.id}
                          </button>
                        </div>
                      </div>

                      {/* ANALYTICS SUMMARY BAR */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 rounded-xl bg-slate-900/90 border border-white/[0.06] text-xs">
                        <div>
                          <span className="text-slate-400 block font-semibold text-[10px] uppercase">Total Responses</span>
                          <span className="text-white font-black text-sm">{totalResponses} users</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold text-[10px] uppercase">Correct Responses</span>
                          <span className="text-emerald-400 font-black text-sm">{correctCount} ({accuracyPct}%)</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold text-[10px] uppercase">Unanswered</span>
                          <span className="text-amber-400 font-black text-sm">{unansweredCount} users</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold text-[10px] uppercase">Correct Option</span>
                          <span className="text-purple-300 font-black text-sm">Option {String.fromCharCode(65 + q.correctAnswerIndex)}</span>
                        </div>
                      </div>

                      {/* OPTION-WISE BREAKDOWN BARS */}
                      <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                        {q.options.map((optText, optIdx) => {
                          const votes = optionCounts[optIdx] || 0;
                          const pct = totalResponses > 0 ? Math.round((votes / totalResponses) * 100) : 0;
                          const isCorrect = optIdx === q.correctAnswerIndex;
                          const currentGradient = BAR_GRADIENTS[optIdx % BAR_GRADIENTS.length];

                          return (
                            <div
                              key={optIdx}
                              className={`p-3 rounded-2xl border transition-colors ${isCorrect
                                ? "bg-emerald-950/20 border-emerald-500/40"
                                : "bg-slate-900/60 border-white/[0.06]"
                                }`}
                            >
                              <div className="flex justify-between items-center text-xs font-bold mb-1.5 gap-2 flex-wrap">
                                <span className="text-white flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] text-purple-300 shrink-0">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  {optText.endsWith(".png") || optText.endsWith(".jpg") ? (
                                    <span className="text-purple-300 underline font-mono text-[11px]">
                                      [Image Option {optIdx + 1}]
                                    </span>
                                  ) : (
                                    <span className="truncate">{optText}</span>
                                  )}
                                  {isCorrect && (
                                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-extrabold text-[10px] px-2 py-0 shrink-0">
                                      ✓ Correct Answer
                                    </Badge>
                                  )}
                                </span>
                                <span className="text-slate-300 text-xs font-semibold shrink-0">
                                  {votes} votes ({pct}%)
                                </span>
                              </div>

                              {/* GPU Accelerated scaleX Bar */}
                              <div className="h-2.5 rounded-full bg-slate-950/80 overflow-hidden border border-white/[0.06]">
                                <div
                                  className={`h-full bg-gradient-to-r ${currentGradient} rounded-full origin-left`}
                                  style={{
                                    transform: `scaleX(${pct / 100})`,
                                    transition: "transform 700ms ease-out",
                                    willChange: "transform",
                                  }}
                                />
                              </div>

                              {/* Team Vote Share Breakdown */}
                              {(() => {
                                let tA = 0;
                                let tB = 0;
                                responseEntries.forEach(([regNum, selectedIdx]) => {
                                  if (selectedIdx === optIdx) {
                                    const team = participantTeamMap[regNum.toUpperCase()];
                                    if (team === "Team A") tA++;
                                    else if (team === "Team B") tB++;
                                  }
                                });
                                const teamTotal = tA + tB;
                                if (teamTotal === 0) return null;
                                const pA = Math.round((tA / teamTotal) * 100);
                                const pB = Math.round((tB / teamTotal) * 100);

                                return (
                                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                                    <span className="text-slate-400 font-medium">Team Share:</span>
                                    {tA > 0 && (
                                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] px-2 py-0">
                                        ⚔️ Team A: {pA}% ({tA})
                                      </Badge>
                                    )}
                                    {tB > 0 && (
                                      <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] px-2 py-0">
                                        🛡️ Team B: {pB}% ({tB})
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>

                      {/* PARTICIPANT OPTION PICK DETAILS (OPTIONAL EXPANDABLE VIEW) */}
                      {totalResponses > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/[0.06]">
                          <button
                            onClick={() => toggleExpandDetails(q.id)}
                            className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
                          >
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                            <span>{isExpanded ? "Hide Participant Selection Details" : "View Participants Breakdown"}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-2 max-h-60 overflow-y-auto">
                              {responseEntries.map(([regNum, selectedOptIdx]) => {
                                const name = participantMap[regNum.toUpperCase()] || regNum;
                                const isAnsCorrect = selectedOptIdx === q.correctAnswerIndex;
                                return (
                                  <div
                                    key={regNum}
                                    className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/50 border border-white/5"
                                  >
                                    <span className="font-bold text-white">
                                      {name} <span className="text-slate-500 font-mono text-[10px]">({regNum})</span>
                                    </span>
                                    <span className={isAnsCorrect ? "text-emerald-400 font-bold" : "text-slate-400"}>
                                      Option {String.fromCharCode(65 + selectedOptIdx)} {isAnsCorrect ? "✓" : "✗"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0">
                    Registered Participants ({filteredParticipants.length})
                  </h1>
                  <p className="text-slate-400 text-xs font-semibold mt-1">
                    Manage event participant registrations, scores, and entries in Firestore.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenParticipantModal()}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer min-h-[44px]"
                >
                  ➕ Add New Participant
                </button>
              </div>

              {/* RANDOM PLAYER DRAFT / TEAM SELECTOR CARD */}
              <Card className="bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950/40 border-purple-500/30 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl relative overflow-hidden">
                <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      <Dices size={20} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white m-0 flex items-center gap-2">
                        Random Player Draft <Sparkles size={16} className="text-yellow-400 animate-pulse" />
                      </h3>
                      <p className="text-xs text-slate-400 font-medium m-0">
                        Randomly select players directly from the database first for Team A, then for Team B.
                      </p>
                    </div>
                  </div>

                  {(selectedTeamAPlayer || selectedTeamBPlayer) && (
                    <button
                      onClick={() => {
                        setSelectedTeamAPlayer(null);
                        setSelectedTeamBPlayer(null);
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 transition-colors"
                    >
                      Clear Picked Players
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* TEAM A PICK SLOT */}
                  <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 relative flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-black text-xs px-3 py-1">
                        ⚔️ TEAM A SLOT
                      </Badge>
                      <button
                        onClick={() => handlePickRandomPlayer("Team A")}
                        disabled={isSelectingTeamA || participantsList.length === 0}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Dices size={14} className={isSelectingTeamA ? "animate-spin" : ""} />
                        {isSelectingTeamA ? "Picking Player..." : "Pick Player for Team A"}
                      </button>
                    </div>

                    <div className="min-h-[76px] flex items-center justify-center p-3 rounded-xl bg-slate-950/70 border border-purple-500/20 text-center">
                      {selectedTeamAPlayer ? (
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-white m-0">{selectedTeamAPlayer.fullName || selectedTeamAPlayer.name}</h4>
                          <span className="text-xs font-mono text-purple-300 font-bold block">
                            Reg #: {selectedTeamAPlayer.registrationNumber || selectedTeamAPlayer.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold block">
                            Score: ⭐ {selectedTeamAPlayer.totalScore || 0} PTS
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 font-semibold m-0">No player selected for Team A yet. Click button to spin & pick.</p>
                      )}
                    </div>

                    {selectedTeamAPlayer && (
                      <button
                        onClick={() => handleAssignTeam(selectedTeamAPlayer, "Team A")}
                        className="w-full py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck size={14} /> Assign {selectedTeamAPlayer.fullName?.split(" ")[0]} to Team A in DB
                      </button>
                    )}
                  </div>

                  {/* TEAM B PICK SLOT */}
                  <div className="p-4 rounded-2xl bg-sky-950/20 border border-sky-500/30 relative flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 font-black text-xs px-3 py-1">
                        🛡️ TEAM B SLOT
                      </Badge>
                      <button
                        onClick={() => handlePickRandomPlayer("Team B")}
                        disabled={isSelectingTeamB || participantsList.length === 0}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-black text-xs shadow-lg shadow-sky-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Dices size={14} className={isSelectingTeamB ? "animate-spin" : ""} />
                        {isSelectingTeamB ? "Picking Player..." : "Pick Player for Team B"}
                      </button>
                    </div>

                    <div className="min-h-[76px] flex items-center justify-center p-3 rounded-xl bg-slate-950/70 border border-sky-500/20 text-center">
                      {selectedTeamBPlayer ? (
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-white m-0">{selectedTeamBPlayer.fullName || selectedTeamBPlayer.name}</h4>
                          <span className="text-xs font-mono text-sky-300 font-bold block">
                            Reg #: {selectedTeamBPlayer.registrationNumber || selectedTeamBPlayer.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold block">
                            Score: ⭐ {selectedTeamBPlayer.totalScore || 0} PTS
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 font-semibold m-0">No player selected for Team B yet. Click button to spin & pick.</p>
                      )}
                    </div>

                    {selectedTeamBPlayer && (
                      <button
                        onClick={() => handleAssignTeam(selectedTeamBPlayer, "Team B")}
                        className="w-full py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck size={14} /> Assign {selectedTeamBPlayer.fullName?.split(" ")[0]} to Team B in DB
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search participants by name or reg number..."
                  value={participantSearch}
                  onChange={(e) => {
                    setParticipantSearch(e.target.value);
                    setVisibleParticipantCount(PAGE_SIZE);
                  }}
                  className="w-full px-4 py-3 pl-10 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs font-semibold outline-none focus:border-violet-500 placeholder:text-slate-500 min-h-[44px]"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              </div>

              <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-4 sm:p-6 backdrop-blur-2xl shadow-xl">
                {visibleParticipants.length > 0 ? (
                  <div className="space-y-3">
                    {visibleParticipants.map((u) => {
                      const pName = u.fullName || u.name || "Participant";
                      const pReg = u.registrationNumber || u.id;
                      return (
                        <div
                          key={u.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-400/40 transition-colors gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm sm:text-base font-bold text-white m-0 leading-snug">{pName}</h4>
                              {u.team && (
                                <Badge className={u.team === "Team A" ? "bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px]" : "bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px]"}>
                                  {u.team}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] sm:text-xs font-mono text-violet-400 font-semibold block mt-0.5">
                              Reg #: {pReg}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                            <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 font-extrabold text-[10px] sm:text-xs px-2.5 sm:px-3 py-1">
                              ⭐ {u.totalScore || 0} PTS
                            </Badge>
                            <button
                              onClick={() => handleOpenParticipantModal(u)}
                              className="px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/30 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteParticipant(u.id, pName)}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-6 text-xs sm:text-sm">
                    {participantSearch ? "No matching participants found." : "No registered participants found."}
                  </p>
                )}

                {hasMoreParticipants && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleLoadMoreParticipants}
                      className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-violet-500/15 hover:border-violet-400/40 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
                    >
                      Load 25 More ({filteredParticipants.length - visibleParticipantCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TOOLS TAB */}
          {activeTab === "tools" && (
            <div>
              <h1 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "8px" }}>Database Operations</h1>
              <p style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "32px" }}>
                Manage Firestore database initialization & data seeding.
              </p>

              <div
                style={{
                  background: "rgba(17, 20, 32, 0.7)",
                  border: "1px solid rgba(124, 58, 237, 0.3)",
                  borderRadius: "16px",
                  padding: "32px",
                  maxWidth: "500px",
                }}
              >
                <h3 style={{ margin: "0 0 12px", fontSize: "1.2rem", fontWeight: 700 }}>Seed Firestore Collections</h3>
                <p style={{ fontSize: "0.88rem", color: "#cbd5e1", lineHeight: 1.6, marginBottom: "24px" }}>
                  Runs initial seed operations to populate default events, user collections, leaderboard records, and administrator documents.
                </p>
                <SeedDatabaseButton />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* CREATE / EDIT POLL MODAL */}
      {pollModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0d111d",
              border: "1px solid rgba(124, 58, 237, 0.4)",
              borderRadius: "20px",
              padding: "32px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
            }}
          >
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 6px", color: "#f8fafc" }}>
              {editingPollId ? "✏️ Edit Poll" : "➕ Create New Poll"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 24px" }}>
              Configure question and selectable choices for interactive audience voting.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Poll Question
                </label>
                <input
                  type="text"
                  placeholder="e.g. Which event area are you most excited about?"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Options
                </label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <input
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = e.target.value;
                        setPollOptions(newOpts);
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "10px",
                        color: "white",
                        fontSize: "0.9rem",
                        outline: "none",
                      }}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        style={{
                          padding: "0 12px",
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          borderRadius: "10px",
                          color: "#fca5a5",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    style={{
                      marginTop: "4px",
                      padding: "8px 16px",
                      background: "rgba(124, 58, 237, 0.2)",
                      border: "1px solid rgba(124, 58, 237, 0.4)",
                      borderRadius: "10px",
                      color: "#c4b5fd",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "28px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setPollModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "#cbd5e1",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePoll}
                disabled={isSavingPoll}
                style={{
                  padding: "10px 24px",
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  border: "none",
                  borderRadius: "10px",
                  color: "white",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: isSavingPoll ? 0.6 : 1,
                }}
              >
                {isSavingPoll ? "Saving..." : editingPollId ? "Save Changes" : "Create Poll"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT EVENT MODAL */}
      {eventModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0d111d",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: "20px",
              padding: "32px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
            }}
          >
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 6px", color: "#f8fafc" }}>
              {editingEventId ? "✏️ Edit Event" : "➕ Create New Event"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 24px" }}>
              Define title, category, location, and scheduling details for icebreaking activities.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Event Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Speed Networking Arena"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Gaming / Icebreaker"
                    value={eventCategory}
                    onChange={(e) => setEventCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Status
                  </label>
                  <select
                    value={eventStatus}
                    onChange={(e) => setEventStatus(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "#161b2c",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  >
                    <option value="live">🟢 Live / Active</option>
                    <option value="upcoming">⏳ Upcoming</option>
                    <option value="completed">🏁 Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Description
                </label>
                <textarea
                  placeholder="Describe the activity flow..."
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.9rem",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Venue / Room
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lab 204"
                    value={eventVenue}
                    onChange={(e) => setEventVenue(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Scheduled Time / Date
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2:00 PM - 3:30 PM or 20-08-2026"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Pricing telemetry fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    List Price (₹ Original Fee)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 100"
                    value={eventOriginalFee}
                    onChange={(e) => setEventOriginalFee(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                    Offer Price (₹ Charged)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 (Free)"
                    value={eventFee}
                    onChange={(e) => setEventFee(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "0.9rem",
                      outline: "none",
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "28px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEventModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "#cbd5e1",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEvent}
                disabled={isSavingEvent}
                style={{
                  padding: "10px 24px",
                  background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                  border: "none",
                  borderRadius: "10px",
                  color: "white",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: isSavingEvent ? 0.6 : 1,
                }}
              >
                {isSavingEvent ? "Saving..." : editingEventId ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTRANT & ATTENDANCE DESK MODAL */}
      {adminPanelEventId && (() => {
        const allRegistrants = adminRegistrants[adminPanelEventId] || [];
        const presentCount = allRegistrants.filter((r) => r.is_present).length;
        const absentCount = allRegistrants.length - presentCount;

        const q = registrantSearch.trim().toLowerCase();
        let filtered = allRegistrants;

        if (q) {
          filtered = filtered.filter(
            (r) =>
              r.full_name.toLowerCase().includes(q) ||
              r.user_email.toLowerCase().includes(q) ||
              r.registration_number.toLowerCase().includes(q) ||
              (r.phone && r.phone.includes(q))
          );
        }

        if (presenceFilter === "Present") {
          filtered = filtered.filter((r) => r.is_present);
        } else if (presenceFilter === "Absent") {
          filtered = filtered.filter((r) => !r.is_present);
        }

        const currentEvt = eventsList.find((e) => e.id === adminPanelEventId);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#0a0d18]/95 border border-violet-500/40 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-4 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.35)] relative max-h-[90vh] sm:max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300">
              <button
                onClick={() => {
                  setAdminPanelEventId(null);
                  setRegistrantSearch("");
                  setPresenceFilter("All");
                }}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="space-y-1 shrink-0">
                <div className="flex items-center justify-between pr-8">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    ADMIN — REGISTRANTS &amp; ATTENDANCE
                  </span>
                  <button
                    onClick={() => handleExportCSV(adminPanelEventId)}
                    className="px-3 py-1 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/40 text-violet-300 text-[10px] font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Export participants to CSV file"
                  >
                    <Download size={12} />
                    <span>Export CSV</span>
                  </button>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white leading-snug">
                  {currentEvt?.title || "Event Roster"}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 pt-0.5">
                  <span>
                    {allRegistrants.length}/{SEAT_LIMIT} registered
                  </span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">{presentCount} Present</span>
                  <span>•</span>
                  <span className="text-rose-400 font-bold">{absentCount} Absent</span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search name, reg no, email…"
                    value={registrantSearch}
                    onChange={(e) => setRegistrantSearch(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-white/[0.04] border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-violet-400 focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all font-medium"
                  />
                  {registrantSearch && (
                    <button
                      onClick={() => setRegistrantSearch("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Attendance Filter Tabs */}
                <div className="flex items-center bg-black/60 p-1.5 rounded-2xl border border-white/10 shrink-0">
                  {(["All", "Present", "Absent"] as const).map((filterOpt) => {
                    const isActive = presenceFilter === filterOpt;
                    const badgeCount =
                      filterOpt === "All"
                        ? allRegistrants.length
                        : filterOpt === "Present"
                        ? presentCount
                        : absentCount;
                    return (
                      <button
                        key={filterOpt}
                        onClick={() => setPresenceFilter(filterOpt)}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>{filterOpt}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                            isActive ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {badgeCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Registrant List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {allRegistrants.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs font-medium">No registrations yet.</div>
                ) : filtered.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs font-medium">
                    No registrants match the selected criteria.
                  </div>
                ) : (
                  filtered.map((r, idx) => (
                    <div
                      key={r.docId}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-200 ${
                        r.is_present
                          ? "bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                          : "bg-white/[0.03] border-white/10 hover:border-violet-500/40 hover:bg-violet-500/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="text-[10px] font-mono text-slate-500 w-5 shrink-0">#{idx + 1}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs sm:text-sm font-bold text-white truncate">{r.full_name}</p>
                            {r.is_present && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                                <CheckSquare size={10} />
                                Present
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">{r.user_email}</p>
                          <p className="text-[10px] font-mono text-violet-300">{r.registration_number}</p>
                          {r.phone && <p className="text-[10px] text-slate-500 font-mono">{r.phone}</p>}
                        </div>
                      </div>

                      {/* Action buttons: Present toggle & Remove */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <button
                          onClick={() => handleTogglePresence(r.docId, Boolean(r.is_present))}
                          disabled={togglingPresenceId === r.docId}
                          title={r.is_present ? "Mark as Absent" : "Mark as Present"}
                          className={`px-3.5 py-2 rounded-xl text-[10px] font-extrabold transition-all duration-200 flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer ${
                            r.is_present
                              ? "bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                              : "bg-white/10 hover:bg-emerald-500/20 border border-white/20 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300"
                          }`}
                        >
                          {r.is_present ? <CheckSquare size={13} /> : <Square size={13} />}
                          <span>
                            {togglingPresenceId === r.docId
                              ? "Saving..."
                              : r.is_present
                              ? "Marked Present"
                              : "Mark Present"}
                          </span>
                        </button>

                        <button
                          onClick={() => handleRemoveRegistrant(r.docId)}
                          disabled={removingRegistrantId === r.docId}
                          title="Remove registrant"
                          className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold transition-all duration-200 flex items-center gap-1 disabled:opacity-50 active:scale-95 cursor-pointer"
                        >
                          <UserX size={13} />
                          {removingRegistrantId === r.docId ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT PARTICIPANT MODAL */}
      {participantModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0d111d",
              border: "1px solid rgba(124, 58, 237, 0.4)",
              borderRadius: "20px",
              padding: "32px",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
            }}
          >
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 6px", color: "#f8fafc" }}>
              {editingParticipantId ? "✏️ Edit Participant" : "➕ Add Participant"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 24px" }}>
              Update registration details or adjust points directly in Firestore.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Registration Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 25BCY10001"
                  value={editParticipantReg}
                  onChange={(e) => setEditParticipantReg(e.target.value.toUpperCase())}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Mercer"
                  value={editParticipantName}
                  onChange={(e) => setEditParticipantName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                  Total Points / Score
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={editParticipantScore}
                  onChange={(e) => setEditParticipantScore(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "28px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setParticipantModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "#cbd5e1",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveParticipant}
                disabled={isSavingParticipant}
                style={{
                  padding: "10px 24px",
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  border: "none",
                  borderRadius: "10px",
                  color: "white",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: isSavingParticipant ? 0.6 : 1,
                }}
              >
                {isSavingParticipant ? "Saving..." : editingParticipantId ? "Save Changes" : "Add Participant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      <AdminConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        onOpenChange={(open) => setConfirmModal((prev) => ({ ...prev, isOpen: open }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
