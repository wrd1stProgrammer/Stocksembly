import type Database from "better-sqlite3";
import { z } from "zod";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ArtifactCasPort } from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";

const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  logical_key: z.string(),
});
export type ChairArtifactRow = z.infer<typeof ArtifactRowSchema>;

const AgentEnvelopeSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string(),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: z.unknown(),
  })
  .passthrough();

const SpecialistJobSchema = z
  .object({
    request: z
      .object({
        mandate: z
          .object({
            mandateHash: z.string().regex(/^[a-f0-9]{64}$/),
            question: z.string().optional(),
            scope: z.enum(["broad", "focused"]),
            locale: z.enum(["en", "ko"]),
            limitations: z.array(
              z.object({ kind: z.string(), detail: z.string() }).strict(),
            ),
          })
          .strict(),
      })
      .passthrough(),
  })
  .passthrough();

export function chairArtifactRows(
  database: Database.Database,
  runId: string,
): readonly ChairArtifactRow[] {
  return database
    .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
      artifacts.snapshot_id, artifacts.content_hash, artifacts.logical_key
      FROM artifacts WHERE artifacts.run_id = ?`)
    .all(runId)
    .map((row) => ArtifactRowSchema.parse(row));
}

export async function chairArtifactJson(
  cas: ArtifactCasPort,
  row: ChairArtifactRow,
): Promise<unknown | undefined> {
  const stored = await cas.get(row.content_hash);
  if (
    stored === undefined ||
    stored.descriptor.artifactId !== row.artifact_id ||
    stored.descriptor.runId !== row.run_id ||
    stored.descriptor.snapshotId !== row.snapshot_id ||
    hashBytes(stored.bytes) !== row.content_hash
  )
    return undefined;
  try {
    return parseSafeJson(new TextDecoder().decode(stored.bytes));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export async function chairAgentPayload(
  cas: ArtifactCasPort,
  row: ChairArtifactRow,
  logicalArtifactId: string,
): Promise<unknown | undefined> {
  const envelope = AgentEnvelopeSchema.safeParse(
    await chairArtifactJson(cas, row),
  );
  if (
    !envelope.success ||
    envelope.data.runId !== row.run_id ||
    envelope.data.snapshotId !== row.snapshot_id ||
    envelope.data.logicalArtifactId !== logicalArtifactId ||
    hashCanonical(envelope.data.payload) !== envelope.data.outputHash
  )
    return undefined;
  return envelope.data.payload;
}

export function loadChairMandate(database: Database.Database, runId: string) {
  const row = z.object({ result_json: z.string() }).safeParse(
    database
      .prepare(`SELECT result_json FROM idempotency_records
        WHERE scope = 'specialist-round-job' AND idempotency_key LIKE ?
        ORDER BY idempotency_key LIMIT 1`)
      .get(`${runId}:%`),
  );
  if (!row.success) return undefined;
  const job = z
    .object({ prompt: z.string() })
    .passthrough()
    .safeParse(parseSafeJson(row.data.result_json));
  if (!job.success) return undefined;
  const sealedRequest = job.data.prompt.split("\n", 1)[0];
  if (sealedRequest === undefined) return undefined;
  return SpecialistJobSchema.safeParse(parseSafeJson(sealedRequest)).data
    ?.request.mandate;
}
