import type { PublicRun } from "../server/api/researchApiContracts";

export type ResearchQueueMessage = {
  readonly schemaVersion: "research-queue-v1";
  readonly runId: string;
  readonly createdAt: string;
};

export interface ResearchDispatchQueue {
  readonly enqueue: (run: PublicRun) => Promise<void>;
  readonly close: () => void;
}

export interface ResearchWorkSignal {
  readonly wait: (signal: AbortSignal) => Promise<boolean>;
  readonly close: () => void;
}
