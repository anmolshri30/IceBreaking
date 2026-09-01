import type { Metadata } from "next";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { VideoBackground } from "@/components/ui/VideoBackground";
import PlannedEvents from "@/components/events/PlannedEvents";

export const metadata: Metadata = {
  title: "Planned Future Events & Faculty Desk | VRGC VIT Bhopal",
  description: "Browse planned event proposals, tentative dates, and faculty review milestones for VRGC at VIT Bhopal.",
};

export default function PlannedEventsPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-slate-100 overflow-x-hidden">
      <VideoBackground />
      <PublicNavbar />
      <main className="relative z-10 flex-1 pt-24 pb-16">
        <PlannedEvents />
      </main>
      <PublicFooter />
    </div>
  );
}
