import { z } from "zod";
import { RunIdSchema } from "../../domain/ids";
import { RunStatusSchema } from "../../domain/runStateContracts";
import { WORKFLOW_PUBLIC_EVENT_KINDS } from "../../workflow/publicEventsContracts";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { researchTransaction } from "../persistence/postgres/database";
import { parseSafeJson } from "../persistence/postgres/safeJson";
import type { PublicResearchEvent } from "./researchApiContracts";
import { EventPayloadSchema, EventRowSchema } from "./researchApiRows";

const SnapshotRowSchema = z.object({
  status: RunStatusSchema,
  last_event_seq: z.number().int().nonnegative(),
});
const MinimumRowSchema = z.object({
  minimum: z.number().int().positive().nullable(),
  retained_count: z.number().int().nonnegative(),
});
const publicKinds = new Set<string>(WORKFLOW_PUBLIC_EVENT_KINDS);

export type RunEventSnapshot = {
  readonly status: z.infer<typeof RunStatusSchema>;
  readonly lastEventSeq: number;
  readonly minimumEventSeq: number | null;
  readonly entries: readonly RunEventStreamEntry[];
  readonly lineageComplete: boolean;
};

export type RunEventStreamEntry =
  | { readonly kind: "public"; readonly event: PublicResearchEvent }
  | { readonly kind: "cursor"; readonly sequence: number };

function streamEntry(input: unknown): RunEventStreamEntry {
  const row = EventRowSchema.parse(input);
  if (!publicKinds.has(row.event_type)) {
    return { kind: "cursor", sequence: row.sequence };
  }
  const payload = EventPayloadSchema.parse(parseSafeJson(row.payload_json));
  return {
    kind: "public",
    event: {
      sequence: row.sequence,
      kind: row.event_type,
      occurredAt: row.occurred_at,
      stateId: row.state_id,
      ...(payload.summary === undefined ? {} : { summary: payload.summary }),
      ...(payload.actorId === undefined ? {} : { actorId: payload.actorId }),
      ...(payload.artifactId === undefined
        ? {}
        : { artifactId: payload.artifactId }),
      ...(payload.logicalArtifactId === undefined
        ? {}
        : { logicalArtifactId: payload.logicalArtifactId }),
      ...(payload.reportId === undefined ? {} : { reportId: payload.reportId }),
      ...(payload.reportVersionId === undefined
        ? {}
        : { reportVersionId: payload.reportVersionId }),
      participantIds: payload.participantIds,
      claimIds: payload.claimIds,
      sourceIds: payload.sourceIds,
      limitationIds: payload.limitationIds,
    },
  };
}

export class RunEventsSseRepository {
  readonly #database: ResearchDatabase;

  constructor(options: {
    readonly database: ResearchDatabase;
  }) {
    this.#database = options.database;
  }

  async snapshot(
    principalId: string,
    runId: string,
    after: number,
  ): Promise<RunEventSnapshot | undefined> {
    return await researchTransaction(this.#database, async (transaction) => {
      const rawSnapshot = (
        await transaction.query(
          `SELECT runs.status, runs.last_event_seq FROM runs
          JOIN research_requests USING(run_id)
          WHERE runs.run_id = $1 AND research_requests.principal_id = $2 FOR SHARE OF runs`,
          [RunIdSchema.parse(runId), principalId],
        )
      ).rows[0];
      if (rawSnapshot === undefined) return undefined;
      const snapshot = SnapshotRowSchema.parse(rawSnapshot);
      const retention = MinimumRowSchema.parse(
        (
          await transaction.query(
            `SELECT MIN(sequence) AS minimum, CAST(COUNT(*) AS integer) AS retained_count
            FROM run_events WHERE run_id = $1`,
            [runId],
          )
        ).rows[0],
      );
      const rows = (
        await transaction.query(
          `SELECT sequence, event_type, state_id, occurred_at, payload_json
          FROM run_events WHERE run_id = $1 AND sequence > $2
          AND sequence <= $3 ORDER BY sequence`,
          [runId, after, snapshot.last_event_seq],
        )
      ).rows;
      const entries = rows.map(streamEntry);
      return {
        status: snapshot.status,
        lastEventSeq: snapshot.last_event_seq,
        minimumEventSeq: retention.minimum,
        entries,
        lineageComplete:
          (retention.minimum === null
            ? snapshot.last_event_seq === 0
            : retention.retained_count ===
              snapshot.last_event_seq - retention.minimum + 1) &&
          rows.length === Math.max(0, snapshot.last_event_seq - after),
      };
    });
  }

  close(): void {
    // The process owns the shared pool.
  }
}
