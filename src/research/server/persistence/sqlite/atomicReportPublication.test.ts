import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AuthoritativeReportCommit } from "../../../application/assembleReportPersistence";
import { persistAuthoritativeReport } from "../../../application/assembleReportPersistence";
import { createSqliteChairSynthesis } from "../../../workflow/chairSynthesis";
import { createPreparedChairRound } from "../../../workflow/chairSynthesis.testSupport";
import {
  type AtomicPublicationInput,
  publishReportAtomically,
} from "./atomicReportPublication";
import { loadReportAuthority } from "./authoritativeReportAuthority";

const AcceptedSchema = z.object({
  artifact_id: z.string().uuid(),
  owner_id: z.string(),
  fence_token: z.number().int().positive(),
  ordinal: z.number().int().positive(),
  job_id: z.string().uuid(),
  attempt_id: z.string().uuid(),
});

function publicationState(databasePath: string, runId: string) {
  const database = new Database(databasePath);
  const state = database
    .prepare(`SELECT status, report_id, version, last_event_seq,
    (SELECT COUNT(*) FROM reports) AS reports,
    (SELECT COUNT(*) FROM report_versions) AS report_versions,
    (SELECT COUNT(*) FROM artifacts WHERE logical_key LIKE 'report_version:%') AS report_artifacts,
    (SELECT COUNT(*) FROM artifact_edges JOIN artifacts
      ON child_artifact_id = artifact_id
      WHERE logical_key LIKE 'report_version:%') AS report_edges,
    (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS report_events
    FROM runs WHERE run_id = ?`)
    .get(runId);
  database.close();
  return state;
}

async function prepareAtomicInput() {
  const prepared = await createPreparedChairRound("none");
  const chair = createSqliteChairSynthesis(prepared.options);
  await chair.stage({ runId: prepared.runId });
  await chair.drain(prepared.runId);
  await chair.close();
  const database = new Database(prepared.options.databasePath);
  const accepted = AcceptedSchema.parse(
    database
      .prepare(`SELECT agent_output_commits.artifact_id,
      agent_output_commits.owner_id, agent_output_commits.fence_token,
      agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
      FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
      .get(prepared.runId),
  );
  database.close();
  const request = {
    runId: prepared.runId,
    acceptedChairArtifactId: accepted.artifact_id,
    fence: {
      jobId: accepted.job_id,
      attemptId: accepted.attempt_id,
      ordinal: accepted.ordinal,
      ownerId: accepted.owner_id,
      token: accepted.fence_token,
    },
  };
  const authority = await loadReportAuthority(
    prepared.options.databasePath,
    prepared.options.cas,
    request,
  );
  if (authority === undefined) throw new TypeError("missing report authority");
  const commits: AuthoritativeReportCommit[] = [];
  await persistAuthoritativeReport(
    {
      cas: prepared.options.cas,
      persistence: {
        save(commit) {
          commits.push(commit);
          return 1;
        },
      },
    },
    authority,
  );
  const commit = commits[0];
  if (commit === undefined) throw new TypeError("missing report commit");
  return {
    prepared,
    input: {
      ...request,
      expectedRunVersion: authority.runVersion,
      eventId: "00000000-0000-4000-8000-000000009991",
      commit: structuredClone(commit),
    } satisfies AtomicPublicationInput,
  };
}

const faults = {
  cross_run_descriptor: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.descriptor,
      "runId",
      "00000000-0000-4000-8000-000000009992",
    ),
  wrong_version_run: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "runId",
      "00000000-0000-4000-8000-000000009993",
    ),
  wrong_version_snapshot: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "snapshotId",
      "00000000-0000-4000-8000-000000009994",
    ),
  wrong_version_artifact: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "artifactId",
      "00000000-0000-4000-8000-000000009995",
    ),
  malformed_run_id: (input: AtomicPublicationInput) =>
    Reflect.set(input, "runId", "not-a-run-id"),
  malformed_descriptor_artifact: (input: AtomicPublicationInput) =>
    Reflect.set(input.commit.descriptor, "artifactId", "not-an-artifact-id"),
  malformed_version_id: (input: AtomicPublicationInput) =>
    Reflect.set(input.commit.version, "versionId", "not-a-version-id"),
} satisfies Record<string, (input: AtomicPublicationInput) => boolean>;

describe("publishReportAtomically identity boundary", () => {
  it.each(Object.entries(faults))(
    "rejects %s without durable publication mutation",
    async (_fault, mutate) => {
      const { prepared, input } = await prepareAtomicInput();
      const before = publicationState(
        prepared.options.databasePath,
        prepared.runId,
      );
      mutate(input);

      expect(() =>
        publishReportAtomically(prepared.options.databasePath, input),
      ).toThrow();
      expect(
        publicationState(prepared.options.databasePath, prepared.runId),
      ).toEqual(before);
      prepared.cleanup();
    },
    20_000,
  );

  it("rejects a cross-run parent artifact without durable publication mutation", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const foreignRunId = "00000000-0000-4000-8000-000000009996";
    const foreignSnapshotId = "00000000-0000-4000-8000-000000009997";
    const foreignArtifactId = "00000000-0000-4000-8000-000000009998";
    const database = new Database(prepared.options.databasePath);
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database
        .prepare(`INSERT INTO runs(run_id, snapshot_id, status, created_at)
        VALUES (?, ?, 'running', ?)`)
        .run(foreignRunId, foreignSnapshotId, "2026-07-23T00:00:00.000Z");
      database
        .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state,
        requested_at, evidence_cutoff_at, sealed_at)
        VALUES (?, ?, 'sealed', ?, ?, ?)`)
        .run(
          foreignSnapshotId,
          foreignRunId,
          "2026-07-23T00:00:00.000Z",
          "2026-07-23T00:00:00.000Z",
          "2026-07-23T00:00:00.000Z",
        );
      database
        .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, 1, 'application/json', 'foreign:parent', ?, ?)`)
        .run(
          foreignArtifactId,
          foreignRunId,
          foreignSnapshotId,
          "a".repeat(64),
          "b".repeat(64),
          "2026-07-23T00:00:00.000Z",
        );
    })();
    database.close();
    Reflect.set(input.commit.parentArtifactIds, "0", foreignArtifactId);
    const before = publicationState(
      prepared.options.databasePath,
      prepared.runId,
    );

    expect(() =>
      publishReportAtomically(prepared.options.databasePath, input),
    ).toThrow();
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toEqual(before);
    prepared.cleanup();
  }, 20_000);
});
