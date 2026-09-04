"use client";

import { motion } from "motion/react";

export function DotsRing() {
  return (
    <div className="relative h-12 w-12" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <motion.div
          key={`dot-${index}`}
          className="absolute left-1/2 top-0 -ml-1 h-2 w-2 origin-[4px_24px] rounded-full bg-zinc-800 dark:bg-white"
          style={{ rotate: index * 45 }}
          animate={{ scale: [1, 0.5, 1], opacity: [1, 0.3, 1] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: index * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
