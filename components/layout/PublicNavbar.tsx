"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Info, Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/contexts/AudioContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface PublicNavbarProps {
  muted?: boolean;
  onToggleMute?: () => void;
}

export function PublicNavbar({ muted, onToggleMute }: PublicNavbarProps) {
  const audio = useAudio();
  const pathname = usePathname();
  const [hasRegistered, setHasRegistered] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);

  useEffect(() => {
    // Check if user is registered in localStorage
    if (typeof window !== "undefined") {
      const reg = localStorage.getItem("ib_reg_number");
      setHasRegistered(Boolean(reg));
    }

    const unsub = onSnapshot(doc(db, "settings", "registration"), (docSnap) => {
      if (docSnap.exists()) {
        setIsRegistrationOpen(Boolean(docSnap.data()?.isOpen));
      } else {
        setIsRegistrationOpen(false);
      }
    });

    return () => unsub();
  }, []);

  const isMuted = muted !== undefined ? muted : audio?.muted;
  const handleToggleMute = onToggleMute || audio?.toggleMute;
  const showVoiceToggle = muted !== undefined ? true : audio?.hasVideo;

  const isActive = (path: string) => pathname === path;

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "transparent",
        padding: "16px 0",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Brand Logo */}
          <Link
            href="/"
            style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              transition: "transform 0.2s ease",
            }}
            className="hover:scale-[1.02]"
          >
            <Image
              src="/logo.png"
              alt="VRGC Logo"
              width={75}
              height={38}
              style={{ objectFit: "contain" }}
              priority
            />
          </Link>

          {/* Right Action Cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Desktop Navigation */}
            <nav
              className="desktop-nav"
              style={{ display: "flex", alignItems: "center", gap: "10px", marginRight: "8px" }}
            >
              {/* About Link */}
              <Link
                href="/about"
                className={`inline-flex items-center gap-1.5 text-xs sm:text-sm transition-all duration-200 ${
                  isActive("/about")
                    ? "px-3.5 py-1.5 rounded-full text-white font-bold bg-violet-500/20 border border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.35)]"
                    : "px-3 py-1.5 rounded-full text-slate-300 font-semibold hover:text-white hover:bg-white/5"
                }`}
              >
                <Info size={14} />
                <span>About</span>
              </Link>

              {/* Event Hub or Register based on status */}
              {hasRegistered ? (
                <Link
                  href="/event"
                  className={`inline-flex items-center gap-1.5 text-xs sm:text-sm transition-all duration-200 ${
                    isActive("/event")
                      ? "px-3.5 py-1.5 rounded-full text-violet-300 font-bold bg-violet-500/25 border border-violet-400/50 shadow-[0_0_18px_rgba(139,92,246,0.4)]"
                      : "px-3 py-1.5 rounded-full text-violet-300 font-bold hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>🎮 Event Hub</span>
                </Link>
              ) : isRegistrationOpen ? (
                <Link
                  href="/register"
                  className={`inline-flex items-center gap-1.5 text-xs sm:text-sm transition-all duration-200 ${
                    isActive("/register")
                      ? "px-3.5 py-1.5 rounded-full text-white font-bold bg-violet-500/20 border border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.35)]"
                      : "px-3 py-1.5 rounded-full text-slate-300 font-semibold hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>⚡ Register</span>
                </Link>
              ) : (
                <Link
                  href="/event"
                  className={`inline-flex items-center gap-1.5 text-xs sm:text-sm transition-all duration-200 ${
                    isActive("/event")
                      ? "px-3.5 py-1.5 rounded-full text-violet-300 font-bold bg-violet-500/25 border border-violet-400/50 shadow-[0_0_18px_rgba(139,92,246,0.4)]"
                      : "px-3 py-1.5 rounded-full text-violet-300 font-bold hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>🎮 Event Hub</span>
                </Link>
              )}
            </nav>

            {/* Voice Toggle Button */}
            {showVoiceToggle && (
              <button
                onClick={handleToggleMute}
                title={isMuted ? "Turn Sound On" : "Turn Sound Off"}
                aria-label={isMuted ? "Turn Sound On" : "Turn Sound Off"}
                style={{
                  background: isMuted ? "rgba(255, 255, 255, 0.18)" : "rgba(124, 58, 237, 0.9)",
                  border: isMuted ? "1px solid rgba(255, 255, 255, 0.35)" : "1px solid rgba(167, 139, 250, 0.8)",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  transition: "all 0.2s ease",
                  boxShadow: isMuted ? "0 2px 8px rgba(0, 0, 0, 0.3)" : "0 0 14px rgba(124, 58, 237, 0.6)",
                }}
                className="hover:scale-110 active:scale-95"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
