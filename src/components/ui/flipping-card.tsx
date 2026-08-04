"use client";

import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/src/lib/cn";

export interface FlippingCardProps {
  className?: string;
  height?: number;
  width?: number;
  frontContent: ReactNode;
  backContent: ReactNode;
  ariaLabel?: string;
  onActivate?: (() => void) | undefined;
}

const FLIP_SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 24,
};

/**
 * A 3D flip card driven by spring physics. Hovering previews the reverse side,
 * while clicking pins the card for touch and keyboard users.
 */
export function FlippingCard({
  className,
  frontContent,
  backContent,
  height = 300,
  width = 350,
  ariaLabel = "Flip card",
  onActivate,
}: FlippingCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const flipped = hovered || pinned;

  return (
    <button
      type="button"
      className="group cursor-pointer rounded-2xl border-0 bg-transparent p-0 font-medium outline-none [perspective:1200px] focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (flipped && onActivate) {
          onActivate();
          return;
        }
        setPinned((current) => !current);
      }}
      aria-pressed={pinned}
      aria-label={ariaLabel}
    >
      <motion.div
        className={cn(
          "relative h-full w-full rounded-2xl [transform-style:preserve-3d]",
          className,
        )}
        initial={false}
        animate={{
          // WebKit flattens the children when Motion optimizes 0deg to `none`.
          // A visually imperceptible base angle keeps the 3D context intact.
          rotateY: flipped ? 180 : 0.001,
          boxShadow: flipped
            ? "0 24px 50px rgba(15,23,42,0.22)"
            : "0 12px 30px rgba(15,23,42,0.10)",
        }}
        transition={FLIP_SPRING}
      >
        <motion.div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-[inherit] border border-slate-200 bg-white text-slate-900 [backface-visibility:hidden]"
          animate={{ opacity: flipped ? 0 : 1 }}
          transition={{ duration: 0.1, delay: flipped ? 0 : 0.12 }}
          aria-hidden={flipped}
        >
          {frontContent}
          <FlipSheen active={flipped} />
        </motion.div>

        <motion.div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-[inherit] [backface-visibility:hidden] [transform:rotateY(180deg)]"
          animate={{ opacity: flipped ? 1 : 0 }}
          transition={{ duration: 0.1, delay: flipped ? 0.12 : 0 }}
          aria-hidden={!flipped}
        >
          {backContent}
          <FlipSheen active={flipped} />
        </motion.div>
      </motion.div>
    </button>
  );
}

function FlipSheen({ active }: { readonly active: boolean }) {
  return (
    <motion.span
      key={String(active)}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        background:
          "linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.32) 50%, transparent 62%)",
        backgroundSize: "250% 100%",
      }}
      initial={{ backgroundPosition: "120% 0%" }}
      animate={{ backgroundPosition: "-120% 0%" }}
      transition={{ duration: 0.9, ease: [0.33, 1, 0.68, 1] }}
    />
  );
}
