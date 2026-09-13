import { createHash } from "node:crypto";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { z } from "zod";

export const DURABLE_FIXTURE = Object.freeze({
  at: "2026-07-23T00:00:00.000Z",
  runId: "00000000-0000-4000-8000-000000000022",
  snapshotId: "00000000-0000-4000-8000-000000000122",
  jobId: "00000000-0000-4000-8000-000000000222",
  sourceArtifactId: "00000000-0000-4000-8000-000000000422",
  claimId: "00000000-0000-4000-8000-000000000522",
  logicalKey: "memo:market_news",
  inputHash: "a".repeat(64),
  inputManifestHash: "b".repeat(64),
});

const DurableRowSchema = z.object({
  status: z.literal("succeeded"),
  attempt_id: z.string().uuid(),
  outcome: z.literal("accepted"),
  attempts: z.literal(1),
  runner_evidence: z.literal(1),
  commits: z.literal(1),
  artifact_id: z.string().uuid(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  byte_length: z.coerce.number().int().positive(),
  events: z.literal(3),
});

const sourceBytes = Buffer.from(
  JSON.stringify({ kind: "evidence", value: "standalone-worker-fixture" }),
);
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
const sourceLocator = {
  kind: "sec_filing",
  source: "sec_primary_filing",
  sourceUrl: "https://www.sec.gov/Archives/standalone-fixture.htm",
  accession: "0000000000-26-000022",
  form: "10-K",
  filedAt: DURABLE_FIXTURE.at,
  acceptedAt: DURABLE_FIXTURE.at,
  periodEnd: "2025-12-31",
  unit: "USD",
};

const persistedJob = () => ({
  runId: DURABLE_FIXTURE.runId,
  snapshotId: DURABLE_FIXTURE.snapshotId,
  roleId: "market_news",
  jobId: DURABLE_FIXTURE.jobId,
  logicalArtifactId: DURABLE_FIXTURE.logicalKey,
  prompt: JSON.stringify({
    request: {
      role: { id: "market_news" },
      ids: { claimId: DURABLE_FIXTURE.claimId },
    },
    sourceArtifactIds: [DURABLE_FIXTURE.sourceArtifactId],
  }),
  inputHash: DURABLE_FIXTURE.inputHash,
  inputManifestHash: DURABLE_FIXTURE.inputManifestHash,
  sourceArtifactIds: [DURABLE_FIXTURE.sourceArtifactId],
});

async function writeSourceBlob(dataRoot) {
  const directory = join(
    dataRoot,
    "artifacts",
    "sha256",
    sourceDigest.slice(0, 2),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, sourceDigest.slice(2));
  await writeFile(path, sourceBytes, { mode: 0o600 });
  await chmod(path, 0o600);
}

export const seedDurableJob = async (packageRoot, dataRoot) => {
  requireTestDatabase();
  await writeSourceBlob(dataRoot);
  const { Client } = createRequire(join(packageRoot, "package.json"))("pg");
  const database = new Client({
    connectionString: process.env.STOCKSEMBLY_TEST_DATABASE_URL,
    options: "-c search_path=research,pg_catalog",
  });
  await database.connect();
  try {
    await database.query("BEGIN");
    await database.query(
      `INSERT INTO runs(run_id, snapshot_id, status, last_event_seq, created_at)
      VALUES ($1, $2, 'running', 1, $3)`,
      [DURABLE_FIXTURE.runId, DURABLE_FIXTURE.snapshotId, DURABLE_FIXTURE.at],
    );
    await database.query(
      `INSERT INTO snapshots(snapshot_id, run_id, state, requested_at,
      evidence_cutoff_at, sealed_at) VALUES ($1, $2, 'sealed', $3, $4, $5)`,
      [
        DURABLE_FIXTURE.snapshotId,
        DURABLE_FIXTURE.runId,
        DURABLE_FIXTURE.at,
        DURABLE_FIXTURE.at,
        DURABLE_FIXTURE.at,
      ],
    );
    await database.query(
      `INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key,
      input_hash, input_manifest_hash, status, created_at)
      VALUES ($1, $2, $3, 'research', $4, $5, $6, 'queued', $7)`,
      [
        DURABLE_FIXTURE.jobId,
        DURABLE_FIXTURE.runId,
        DURABLE_FIXTURE.snapshotId,
        DURABLE_FIXTURE.logicalKey,
        DURABLE_FIXTURE.inputHash,
        DURABLE_FIXTURE.inputManifestHash,
        DURABLE_FIXTURE.at,
      ],
    );
    await database.query(
      `INSERT INTO idempotency_records(scope, idempotency_key,
      request_hash, result_json, created_at)
      VALUES ('specialist-round-job', $1, $2, $3, $4)`,
      [
        `${DURABLE_FIXTURE.runId}:${DURABLE_FIXTURE.logicalKey}`,
        DURABLE_FIXTURE.inputHash,
        JSON.stringify(persistedJob()),
        DURABLE_FIXTURE.at,
      ],
    );
    await database.query(
      `INSERT INTO run_events(run_id, sequence, event_id, event_type,
      state_id, occurred_at, payload_json) VALUES ($1, 1, $2, 'run_created',
      'running', $3, '{}')`,
      [
        DURABLE_FIXTURE.runId,
        "00000000-0000-4000-8000-000000000322",
        DURABLE_FIXTURE.at,
      ],
    );
    await database.query(
      `INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
      content_hash, byte_length, media_type, logical_key, input_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, 'application/json', 'evidence:standalone', $6, $7)`,
      [
        DURABLE_FIXTURE.sourceArtifactId,
        DURABLE_FIXTURE.runId,
        DURABLE_FIXTURE.snapshotId,
        sourceDigest,
        sourceBytes.byteLength,
        sourceDigest,
        DURABLE_FIXTURE.at,
      ],
    );
    await database.query(
      `INSERT INTO artifact_citation_metadata(artifact_id, locator_json)
      VALUES ($1, $2)`,
      [DURABLE_FIXTURE.sourceArtifactId, JSON.stringify(sourceLocator)],
    );
    await database.query(
      `INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES ($1, $2)`,
      [DURABLE_FIXTURE.jobId, DURABLE_FIXTURE.sourceArtifactId],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
};

export const readDurableJob = async (packageRoot, dataRoot) => {
  requireTestDatabase();
  const { Client } = createRequire(join(packageRoot, "package.json"))("pg");
  const database = new Client({
    connectionString: process.env.STOCKSEMBLY_TEST_DATABASE_URL,
    options: "-c search_path=research,pg_catalog",
  });
  await database.connect();
  try {
    const row = DurableRowSchema.parse(
      (
        await database.query(
          `SELECT jobs.status, attempts.attempt_id, attempts.outcome,
        (SELECT COUNT(*)::integer FROM attempts a WHERE a.job_id = jobs.job_id) attempts,
        (SELECT COUNT(*)::integer FROM agent_runner_evidence e
          WHERE e.attempt_id = attempts.attempt_id) runner_evidence,
        (SELECT COUNT(*)::integer FROM agent_output_commits c
          WHERE c.attempt_id = attempts.attempt_id) commits,
        artifacts.artifact_id, artifacts.content_hash, artifacts.byte_length,
        (SELECT COUNT(*)::integer FROM run_events r WHERE r.run_id = jobs.run_id) events
        FROM jobs JOIN attempts ON attempts.attempt_id = jobs.attempt_id
        JOIN artifacts ON artifacts.artifact_id = jobs.result_artifact_id
        WHERE jobs.job_id = $1`,
          [DURABLE_FIXTURE.jobId],
        )
      ).rows[0],
    );
    const artifact = await stat(
      join(
        dataRoot,
        "artifacts",
        "sha256",
        row.content_hash.slice(0, 2),
        row.content_hash.slice(2),
      ),
    );
    return {
      status: row.status,
      attemptId: row.attempt_id,
      outcome: row.outcome,
      attempts: row.attempts,
      runnerEvidence: row.runner_evidence,
      committedArtifacts: row.commits,
      artifactId: row.artifact_id,
      artifactDigest: row.content_hash,
      events: row.events,
      artifactPresent: artifact.isFile() && artifact.size === row.byte_length,
    };
  } finally {
    await database.end();
  }
};

function requireTestDatabase() {
  const url = new URL(
    process.env.STOCKSEMBLY_TEST_DATABASE_URL ?? "postgres://invalid/invalid",
  );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  ) {
    throw new Error(
      "Standalone fixtures require a loopback STOCKSEMBLY_TEST_DATABASE_URL ending in _test",
    );
  }
}
