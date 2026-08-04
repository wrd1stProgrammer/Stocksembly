import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createOfficialSpecialistRound } from "../compositions/officialWorker";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexReservation";
import { createLeaseEngine } from "../worker/leaseEngine";
import {
  createRuntimeAttemptHandler,
  LeaseWorkerCliError,
  runLeaseWorkerProcess,
} from "../worker/leaseWorker";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import { createSqliteSpecialistRound } from "./specialistRoundSqlite";
import { makeSqliteRoundHarness } from "./specialistRoundSqlite.testSupport";
import { prepareSpecialistJobs } from "./specialistRoundSqliteStage";

const temporaryRoots: string[] = [];
const specialistCount = WORKFLOW_V1_SPECIALIST_IDS.length;

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("official SQLite specialist round", () => {
  it("bounds role prompts while retaining every assigned evidence source", async () => {
    // Given
    const harness = await makeSqliteRoundHarness("none");
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        value: { text: "revenue margin competition risk ".repeat(12_000) },
      }),
    );
    const sources = harness.sources.map((source) => ({
      ...source,
      bytes,
    }));
    const sourceHashes = new Map(
      sources.map((source) => [
        source.evidenceId,
        ArtifactDigestSchema.parse(hashBytes(source.bytes)),
      ]),
    );
    const assignments = harness.input.assignments.assignments.map(
      (assignment) => {
        const artifacts = assignment.evidenceSlice.artifacts.map((artifact) => {
          const contentHash = sourceHashes.get(artifact.evidenceId);
          if (contentHash === undefined)
            throw new TypeError("missing large evidence fixture");
          return {
            ...artifact,
            rawHash: contentHash,
            ...(artifact.normalizedHash === undefined
              ? {}
              : { normalizedHash: contentHash }),
          };
        });
        const sliceBody = {
          ...assignment.evidenceSlice,
          artifacts,
        };
        const { sliceHash: _sliceHash, ...hashable } = sliceBody;
        return {
          ...assignment,
          evidenceSlice: {
            ...hashable,
            sliceHash: hashCanonical(hashable),
          },
        };
      },
    );
    const snapshotArtifacts = harness.input.snapshot.artifacts.map(
      (artifact) => {
        const contentHash = sourceHashes.get(artifact.evidenceId);
        if (contentHash === undefined)
          throw new TypeError("missing snapshot evidence fixture");
        return {
          ...artifact,
          rawHash: contentHash,
          ...(artifact.normalizedHash === undefined
            ? {}
            : { normalizedHash: contentHash }),
        };
      },
    );

    // When
    const jobs = prepareSpecialistJobs(
      {
        ...harness.input,
        snapshot: {
          ...harness.input.snapshot,
          artifacts: snapshotArtifacts,
        },
        assignments: {
          ...harness.input.assignments,
          assignments,
        },
      },
      sources,
    );

    // Then
    expect(
      Math.max(...jobs.map((job) => Buffer.byteLength(job.prompt))),
    ).toBeLessThanOrEqual(80 * 1_024);
    expect(
      jobs.every(
        (job) =>
          job.sourceArtifactIds.length > 0 &&
          job.sourceArtifactIds.every((id) => job.prompt.includes(id)),
      ),
    ).toBe(true);
  });

  it("durably commits every isolated specialist memo with global concurrency three and replays after restart", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-round-sqlite-"));
    temporaryRoots.push(root);
    const harness = await makeSqliteRoundHarness("none");
    const options = {
      databasePath: join(root, "research.sqlite"),
      attemptRoot: join(root, "attempts"),
      ownerId: "specialist-worker-a",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    };
    const round = createSqliteSpecialistRound(options);

    // When
    await round.stage(harness.input, harness.sources);
    const completed = await round.drain(harness.input.mandate.runId);
    await round.close();
    const restarted = createSqliteSpecialistRound(options);
    const replay = restarted.replay(harness.input.mandate.runId);
    await restarted.close();

    // Then
    expect(completed.receipts.map((receipt) => receipt.outcome)).toEqual(
      Array.from({ length: specialistCount }, () => "accepted"),
    );
    expect(completed.artifactIds).toHaveLength(specialistCount);
    expect(completed.departmentStartAllowed).toBe(true);
    expect(completed.receipts).toHaveLength(specialistCount);
    expect(completed.receipts.map((receipt) => receipt.ordinal)).toEqual(
      Array.from({ length: specialistCount }, (_, index) => index + 1),
    );
    expect(
      completed.receipts.every((receipt) => receipt.evidenceRecorded),
    ).toBe(true);
    expect(
      new Set(completed.receipts.map((receipt) => receipt.attemptId)).size,
    ).toBe(specialistCount);
    expect(new Set(completed.artifactIds).size).toBe(specialistCount);
    expect(completed.eventSequences).toHaveLength(specialistCount);
    expect(harness.codex.maximumActive).toBeGreaterThan(1);
    expect(harness.codex.maximumActive).toBeLessThanOrEqual(3);
    expect(replay).toEqual(completed);
  });

  it("uses one durable replacement ordinal and blocks departments after a second failed attempt", async () => {
    // Given
    const onceRoot = mkdtempSync(join(tmpdir(), "specialist-round-once-"));
    const alwaysRoot = mkdtempSync(join(tmpdir(), "specialist-round-always-"));
    temporaryRoots.push(onceRoot, alwaysRoot);
    const once = await makeSqliteRoundHarness("once");
    const always = await makeSqliteRoundHarness("always");
    const onceRound = createSqliteSpecialistRound({
      databasePath: join(onceRoot, "research.sqlite"),
      attemptRoot: join(onceRoot, "attempts"),
      ownerId: "worker-once",
      cas: once.cas,
      codex: once.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });
    const alwaysRound = createSqliteSpecialistRound({
      databasePath: join(alwaysRoot, "research.sqlite"),
      attemptRoot: join(alwaysRoot, "attempts"),
      ownerId: "worker-always",
      cas: always.cas,
      codex: always.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await onceRound.stage(once.input, once.sources);
    const recovered = await onceRound.drain(once.input.mandate.runId);
    await alwaysRound.stage(always.input, always.sources);
    const incomplete = await alwaysRound.drain(always.input.mandate.runId);
    await onceRound.close();
    await alwaysRound.close();

    // Then
    expect(recovered.receipts).toHaveLength(specialistCount + 1);
    expect(recovered.receipts.at(-1)?.outcome).toBe("accepted");
    expect(recovered.artifactIds).toHaveLength(specialistCount);
    expect(recovered.departmentStartAllowed).toBe(true);
    expect(recovered.receipts.at(-1)?.ordinal).toBe(specialistCount + 1);
    expect(recovered.artifactIds).toHaveLength(specialistCount);
    expect(incomplete.departmentStartAllowed).toBe(false);
    expect(incomplete.receipts).toHaveLength(specialistCount + 1);
    expect(incomplete.artifactIds).toHaveLength(specialistCount - 1);
  });

  it("corrects an invented citation with the durable replacement attempt", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-citation-retry-"));
    temporaryRoots.push(root);
    const harness = await makeSqliteRoundHarness("citation_once");
    const databasePath = join(root, "research.sqlite");
    const round = createSqliteSpecialistRound({
      databasePath,
      attemptRoot: join(root, "attempts"),
      ownerId: "worker-citation-retry",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await round.stage(harness.input, harness.sources);
    const result = await round.drain(harness.input.mandate.runId);
    await round.close();

    // Then
    expect(result.departmentStartAllowed).toBe(true);
    expect(result.artifactIds).toHaveLength(specialistCount);
    expect(result.receipts).toHaveLength(specialistCount + 1);
    const correctivePrompt = harness.codex.prompts.find((prompt) =>
      prompt.includes("CORRECTIVE RETRY — INVALID CITATION IDS"),
    );
    expect(correctivePrompt).toContain("00000000-0000-4000-8000-000000000999");
    expect(correctivePrompt).toContain(harness.sources[0]?.artifactId);
    const database = new Database(databasePath, { readonly: true });
    const replacement = database
      .prepare(`SELECT attempts.input_hash AS attemptInputHash,
        research_call_ordinals.input_hash AS ordinalInputHash,
        jobs.input_hash AS jobInputHash
        FROM attempts JOIN jobs USING(job_id)
        JOIN research_call_ordinals USING(attempt_id)
        WHERE replacement_of_attempt_id IS NOT NULL
        ORDER BY ordinal LIMIT 1`)
      .get() as {
      attemptInputHash: string;
      ordinalInputHash: string;
      jobInputHash: string;
    };
    database.close();
    const correctedInputHash = codexInputHash({
      stage: "memo",
      prompt: correctivePrompt!,
      outputSchema: SpecialistMemoOutputSchema,
    });
    expect(replacement).toEqual({
      attemptInputHash: correctedInputHash,
      ordinalInputHash: correctedInputHash,
      jobInputHash: correctedInputHash,
    });
  });

  it("records the citation-specific reason when the corrective attempt also fails", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-citation-exhausted-"));
    temporaryRoots.push(root);
    const databasePath = join(root, "research.sqlite");
    const harness = await makeSqliteRoundHarness("citation_always");
    const round = createSqliteSpecialistRound({
      databasePath,
      attemptRoot: join(root, "attempts"),
      ownerId: "worker-citation-exhausted",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await round.stage(harness.input, harness.sources);
    const result = await round.drain(harness.input.mandate.runId);
    await round.close();
    const database = new Database(databasePath, { readonly: true });
    const reason = database
      .prepare(`SELECT json_extract(payload_json, '$.code') AS code
        FROM run_events WHERE run_id = ? AND event_type = 'attempt_committed'
        AND json_extract(payload_json, '$.code') IS NOT NULL
        ORDER BY sequence DESC LIMIT 1`)
      .pluck()
      .get(harness.input.mandate.runId);
    database.close();

    // Then
    expect(result.departmentStartAllowed).toBe(false);
    expect(result.artifactIds).toHaveLength(specialistCount - 1);
    expect(reason).toBe("specialist_citation_invalid_after_retry");
  });

  it("is the workflow implementation exported by official composition", () => {
    // Given
    const officialFactory = createOfficialSpecialistRound;

    // When
    const workflowFactory = createSqliteSpecialistRound;

    // Then
    expect(officialFactory).toBe(workflowFactory);
  });

  it("selects the official handler from runtime serve and executes a staged SQLite job", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-round-runtime-"));
    temporaryRoots.push(root);
    const harness = await makeSqliteRoundHarness("none");
    const databasePath = join(root, "research.sqlite");
    const attemptRoot = join(root, "attempts");
    const now = () => "2026-07-23T00:00:00.000Z";
    const staging = createSqliteSpecialistRound({
      databasePath,
      attemptRoot,
      ownerId: "runtime-worker",
      cas: harness.cas,
      codex: harness.codex,
      now,
    });
    await staging.stage(harness.input, harness.sources);
    await staging.close();

    // When
    const runtime = await createRuntimeAttemptHandler(
      {
        dataDirectory: root,
        databasePath,
        ownerId: "runtime-worker",
      },
      { cas: harness.cas, codex: harness.codex, now },
    );
    const engine = createLeaseEngine({
      databasePath,
      ownerId: "runtime-worker",
      handler: runtime.handler,
      clock: { now },
    });
    const result = await engine.poll();
    await engine.shutdown();
    await runtime.close();
    const verification = createSqliteSpecialistRound({
      databasePath,
      attemptRoot,
      ownerId: "runtime-verifier",
      cas: harness.cas,
      codex: harness.codex,
      now,
    });
    const replay = verification.replay(harness.input.mandate.runId);
    await verification.close();
    // Then
    expect(result.kind).toBe("handled");
    expect(harness.codex.launches).toBe(1);
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts[0]?.outcome).toBe("accepted");
  });

  it("rejects handler injection for public runtime commands", async () => {
    // Given
    const handler = {
      run: async () => ({ kind: "accepted" as const }),
    };

    // When
    const command = runLeaseWorkerProcess(["readiness"], handler);

    // Then
    await expect(command).rejects.toBeInstanceOf(LeaseWorkerCliError);
  });
});
