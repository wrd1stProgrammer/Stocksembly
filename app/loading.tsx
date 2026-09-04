"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/src/components/ui/PageSkeleton";

export default function Loading() {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    /^\/(en|ko|ja|zh-TW|es|pt-BR|de|fr)\/?$/.test(pathname)
  ) {
    return <PageSkeleton variant="home" />;
  }
  return (
    <main
      className="min-h-dvh bg-[#08090b] p-8"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
      <div
        aria-hidden="true"
        className="mx-auto max-w-4xl space-y-8 motion-safe:animate-pulse"
      >
        <div className="h-8 w-40 rounded bg-white/[0.06]" />
        <div className="h-px bg-white/10" />
        <div className="h-4 w-3/4 rounded bg-white/[0.06]" />
        <div className="h-4 w-full rounded bg-white/[0.06]" />
        <div className="h-4 w-2/3 rounded bg-white/[0.06]" />
      </div>
    </main>
  );
}
