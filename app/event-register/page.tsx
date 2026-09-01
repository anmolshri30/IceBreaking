import type { Metadata } from "next";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { VideoBackground } from "@/components/ui/VideoBackground";
import EventRegister from "@/components/events/EventRegister";

export const metadata: Metadata = {
  title: "Event Registration & Tournaments | VRGC VIT Bhopal",
  description: "Register for esports tournaments, VR gaming showcases, and campus events by VRGC at VIT Bhopal.",
};

export default function EventRegisterPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-slate-100 overflow-x-hidden">
      <VideoBackground />
      <PublicNavbar />
      <main className="relative z-10 flex-1 pt-24 pb-16">
        <EventRegister />
      </main>
      <PublicFooter />
    </div>
  );
}
