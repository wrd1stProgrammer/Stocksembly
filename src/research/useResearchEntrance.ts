"use client";

import { useEffect, useState } from "react";

const newRuns = new Set<string>();

export function markNewResearchEntrance(runId: string) {
  newRuns.add(runId);
}

// Consume after mounting so Strict Mode reads the same initial decision twice.
// Reloads and later visits restore progress instead of replaying the entrance.
export function useResearchEntrance(runId: string) {
  const [entry, setEntry] = useState(() => ({
    runId,
    fresh: newRuns.has(runId),
  }));
  const current =
    entry.runId === runId ? entry : { runId, fresh: newRuns.has(runId) };
  if (current !== entry) setEntry(current);
  useEffect(() => {
    newRuns.delete(runId);
  }, [runId]);
  return current.fresh;
}
