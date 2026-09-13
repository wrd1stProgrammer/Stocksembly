import { z } from "zod";
import { EventIdSchema } from "../../../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../../../domain/roleRegistry";
import {
  appendWorkflowPublicEvent,
  type WorkflowPublicEvent,
  type WorkflowPublicEventAuthority,
  workflowProgressFromEvents,
} from "../../../workflow/publicEvents";
import { WORKFLOW_PUBLIC_EVENT_KINDS } from "../../../workflow/publicEventsContracts";
import type { ResearchDatabase } from "./database";
import { openPostgresStore, type PostgresStore } from "./postgresStore";
import type { JobSeed } from "./types";
export type WorkflowCoordinatorOptions = {
  readonly database: ResearchDatabase;
};
export type WorkflowSystemTransition = {
  readonly runId: string;
  readonly eventId: string;
  readonly eventKind:
    | "collection_started"
    | "evidence_cutoff_recorded"
    | "snapshot_sealed"
    | "mandate_sealed"
    | "gathering_started"
    | "committee_classified";
  readonly occurredAt: string;
  readonly summary: {
    readonly en: string;
    readonly ko: string;
  };
  readonly nextJobs: readonly JobSeed[];
};
const PayloadSchema = z
  .object({
    participantIds: z.array(z.string()),
    claimIds: z.array(z.string()),
    sourceIds: z.array(z.string()),
    limitationIds: z.array(z.string()),
    summary: z.object({ en: z.string(), ko: z.string() }).strict(),
    actorId: z.string().optional(),
    artifactId: z.string().optional(),
    logicalArtifactId: z.string().optional(),
    reportId: z.string().optional(),
    reportVersionId: z.string().optional(),
  })
  .strip();
const kindSet = new Set<string>(WORKFLOW_PUBLIC_EVENT_KINDS);
const memoJobKeys = new Set(
  WORKFLOW_V1_SPECIALIST_IDS.map((roleId) => `memo:${roleId}`),
);
function hasValidNextJobs(
  eventKind: WorkflowSystemTransition["eventKind"],
  jobs: readonly JobSeed[],
): boolean {
  if (eventKind === "mandate_sealed") {
    const keys = new Set(jobs.map((job) => job.logicalKey));
    return (
      jobs.length === memoJobKeys.size &&
      jobs.every((job) => job.kind === "research") &&
      keys.size === memoJobKeys.size &&
      [...keys].every((key) => memoJobKeys.has(key))
    );
  }
  if (eventKind === "committee_classified")
    return (
      jobs.length === 1 &&
      jobs[0]?.kind === "research" &&
      jobs[0].logicalKey === "chair_synthesis:chair"
    );
  return jobs.length === 0;
}
function authorityFor(kind: string): WorkflowPublicEventAuthority {
  if (kind === "report_published") return "atomic_report_publication";
  if (kind.endsWith("_committed") && kind !== "department_ballot_committed")
    return "trusted_artifact_commit";
  return kind === "department_ballot_committed"
    ? "trusted_artifact_commit"
    : "system";
}
async function replayEvents(store: PostgresStore, runId: string) {
  const run = await store.findRun(runId);
  if (run === undefined) return { ok: false, reason: "run_missing" } as const;
  const events: WorkflowPublicEvent[] = [];
  for (const row of await store.eventsAfter(runId, 0)) {
    if (!kindSet.has(row.type)) continue;
    const payload = PayloadSchema.safeParse(row.payload);
    if (!payload.success)
      return { ok: false, reason: "public_event_invalid" } as const;
    const next = appendWorkflowPublicEvent(
      events,
      {
        eventId: row.eventId,
        runId: row.runId,
        snapshotId: run.snapshotId,
        sequence: row.sequence,
        kind: row.type,
        occurredAt: row.occurredAt,
        ...payload.data,
      },
      authorityFor(row.type),
    );
    if (!next.ok) return next;
    events.push(next.event);
  }
  return { ok: true, events } as const;
}
export async function createWorkflowCoordinator(
  options: WorkflowCoordinatorOptions,
) {
  const store = await openPostgresStore(options.database);
  return {
    async appendSystemTransition(input: WorkflowSystemTransition) {
      const run = await store.findRun(input.runId);
      if (run === undefined)
        return { kind: "blocked", reason: "run_missing" } as const;
      const expectedStatus =
        input.eventKind === "collection_started" ? "queued" : "running";
      if (run.status !== expectedStatus)
        return { kind: "blocked", reason: "run_state_invalid" } as const;
      if (!hasValidNextJobs(input.eventKind, input.nextJobs))
        return { kind: "blocked", reason: "next_jobs_invalid" } as const;
      const eventId = EventIdSchema.safeParse(input.eventId);
      if (!eventId.success)
        return { kind: "blocked", reason: "public_event_invalid" } as const;
      const replay = await replayEvents(store, input.runId);
      if (!replay.ok)
        return { kind: "blocked", reason: replay.reason } as const;
      const candidate = appendWorkflowPublicEvent(
        replay.events,
        {
          eventId: eventId.data,
          runId: input.runId,
          snapshotId: run.snapshotId,
          sequence: run.lastEventSeq + 1,
          kind: input.eventKind,
          occurredAt: input.occurredAt,
          participantIds: [],
          claimIds: [],
          sourceIds: [],
          limitationIds: [],
          summary: input.summary,
        },
        "system",
      );
      if (!candidate.ok)
        return { kind: "blocked", reason: candidate.reason } as const;
      const sequence = await store.transitionRun({
        runId: run.runId,
        fromStatus: run.status,
        toStatus: "running",
        expectedVersion: run.version,
        nextJobs: input.nextJobs,
        event: {
          eventId: eventId.data,
          type: input.eventKind,
          stateId: input.eventKind,
          occurredAt: input.occurredAt,
          payload: {
            schemaVersion: "workflow-v1",
            participantIds: [],
            claimIds: [],
            sourceIds: [],
            limitationIds: [],
            summary: input.summary,
          },
        },
      });
      return { kind: "committed", sequence } as const;
    },
    async replay(runId: string) {
      const replay = await replayEvents(store, runId);
      return replay.ok
        ? {
            kind: "valid" as const,
            events: replay.events,
            progress: workflowProgressFromEvents(replay.events),
          }
        : { kind: "invalid" as const, reason: replay.reason };
    },
    async close() {
      await store.close();
    },
  };
}
