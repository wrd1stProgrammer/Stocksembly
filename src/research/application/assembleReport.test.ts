import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import {
  ArtifactIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { ResearchReportSchema } from "../domain/report";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { publishAuthoritativeReportForRun } from "../server/persistence/sqlite/publishAuthoritativeReportForRun";
import { sqliteReportVersionPersistence } from "../server/persistence/sqlite/sqliteReportPersistence";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { temporaryDatabase } from "../server/persistence/sqlite/sqliteStore.contractFixtures";
import { createSqliteChairSynthesis } from "../workflow/chairSynthesis";
import {
  corruptAcceptedEnvelope,
  createPreparedChairRound,
} from "../workflow/chairSynthesis.testSupport";
import { ChairSynthesisPromptSchema } from "../workflow/chairSynthesisContracts";
import {
  CountingArtifactCasFake,
  makeAuthoritativeReportInput,
  reportPersistenceSpy,
  seedAuthoritativeParents,
} from "./assembleReport.testSupport";
import { persistAuthoritativeReport } from "./assembleReportPersistence";

describe("persistAuthoritativeReport", () => {
  it("stores a valid authoritative report in CAS and saves contiguous version one", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.version).toBe(1);
    expect(result.descriptor.parentDigests).toEqual(
      input.parentArtifacts.map((parent) => parent.digest),
    );
    expect(await cas.has(result.descriptor.digest)).toBe(true);
    expect(persistence.saved).toHaveLength(1);
    expect(persistence.saved[0]?.version.publicPayload).toMatchObject({
      reportArtifactDigest: result.descriptor.digest,
      version: 1,
      priorVersionId: null,
    });
  });

  it("publishes when a retained open question contains a sourced market level", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const questions = valid.structuralAudit.result.retainedOpenQuestions.map(
      (question, index) =>
        index === 0
          ? {
              ...question,
              text: {
                en: "Confirm whether price $313.03 remains below short-term resistance.",
                ko: question.text.ko,
              },
            }
          : question,
    );
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          retainedOpenQuestions: questions,
        },
      },
      chair: {
        ...valid.chair,
        unknowns: questions.map((question) => question.text),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
  });

  it("publishes partial claims without inventing a capability limitation", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          capabilities: valid.structuralAudit.result.capabilities.map(
            (capability) => ({
              ...capability,
              availability: "available" as const,
            }),
          ),
        },
      },
      semanticAudit: {
        ...valid.semanticAudit,
        verdicts: valid.semanticAudit.verdicts.map((verdict, index) =>
          index === 0
            ? { ...verdict, verdict: "partial" as const }
            : verdict,
        ),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.status).toBe("complete_with_limitations");
    expect(result.report.limitations).toContainEqual(
      expect.objectContaining({ capability: "claim_evidence" }),
    );
  });

  it("recovers a numeric revenue scenario from an abbreviated chair sentence", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          scenarios: [
            {
              field: "revenue",
              value:
                "Base: current trajectory; upside: adoption; downside: concentration",
            },
          ],
        },
      },
      chairSentences: valid.chairSentences.map((sentence, index) =>
        index === 0
          ? {
              ...sentence,
              text: {
                en: "Quarterly revenue reached $81.6B.",
                ko: "분기 매출은 816억달러를 기록했습니다.",
              },
            }
          : sentence,
      ),
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.locales.en.scenarios[0]?.assumptions[0]).toEqual({
      metric: "revenue",
      unit: "USD",
      value: "81600000000",
    });
  });

  it("keeps a contradicted retained-dissent claim in the report register", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const retainedClaimId =
      valid.structuralAudit.result.retainedDissentClaimIds[0];
    if (retainedClaimId === undefined)
      throw new TypeError("missing retained dissent fixture");
    const input = {
      ...valid,
      semanticAudit: {
        ...valid.semanticAudit,
        verdicts: valid.semanticAudit.verdicts.map((verdict) => ({
          ...verdict,
          verdict: "contradicted" as const,
          contradictionSeverity: "severe" as const,
        })),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.claims).toContainEqual(
      expect.objectContaining({
        claimId: retainedClaimId,
        materiality: "supporting",
        semanticVerdict: "not_assessable",
        sourceIds: ["00000000-0000-4000-8000-000000000305"],
      }),
    );
  });

  it("writes no CAS blob or version when bilingual chair parity is invalid", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      chair: { ...valid.chair, unknowns: [] },
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "retention_mismatch" });
    expect(persistence.saved).toHaveLength(0);
    expect(cas.putCount).toBe(0);
  });

  it("writes no CAS blob or version when a quality gate fails", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          publishable: false,
          blockers: ["exact_span"],
        },
      },
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "audit_failed" });
    expect(persistence.saved).toHaveLength(0);
    expect(cas.putCount).toBe(0);
  });

  it("rejects an empty authenticated capability posture before CAS or metadata", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: { ...valid.structuralAudit.result, capabilities: [] },
      },
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "report_invalid" });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("preserves bilingual citations, dissent, limitations, and immutable version lineage", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const firstInput = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, firstInput);
    const first = await persistAuthoritativeReport(
      { cas, persistence },
      firstInput,
    );
    if (first.kind !== "published") throw new TypeError("missing first report");
    const secondInput = {
      ...firstInput,
      reportArtifactId: "00000000-0000-4000-8000-000000000305",
      versionId: "00000000-0000-4000-8000-000000000306",
      version: 2,
      priorReport: first.report,
      semanticAudit: {
        ...firstInput.semanticAudit,
        reportVersionId: "00000000-0000-4000-8000-000000000306",
      },
    };

    // When
    const second = await persistAuthoritativeReport(
      { cas, persistence },
      secondInput,
    );

    // Then
    expect(second.kind).toBe("published");
    if (second.kind !== "published") return;
    expect(second.report.versionDelta.priorVersionId).toBe(
      first.report.versionId,
    );
    expect(second.descriptor.digest).not.toBe(first.descriptor.digest);
    expect(
      second.report.locales.en.dissent.map((item) => item.claimId),
    ).toEqual(second.report.locales.ko.dissent.map((item) => item.claimId));
    expect(second.report.status).toBe("complete_with_limitations");
    expect(JSON.stringify(second.report)).not.toMatch(
      /current_price|target_price/,
    );
  });

  it.each([
    "missing",
    "duplicate",
    "wrong_role",
    "cross_run",
    "cross_snapshot",
  ])(
    "blocks %s accepted-artifact provenance before CAS or version metadata",
    async (fault) => {
      // Given
      const cas = new CountingArtifactCasFake();
      const persistence = reportPersistenceSpy();
      const valid = makeAuthoritativeReportInput();
      const artifacts = [...valid.artifacts];
      if (fault === "missing") artifacts.pop();
      else if (fault === "duplicate" && artifacts[0] !== undefined)
        artifacts[10] = artifacts[0];
      else if (fault === "wrong_role" && artifacts[0] !== undefined)
        artifacts[0] = { ...artifacts[0], roleId: "chair" };
      else if (fault === "cross_run" && artifacts[0] !== undefined)
        artifacts[0] = {
          ...artifacts[0],
          runId: "00000000-0000-4000-8000-000000000999",
        };
      else if (fault === "cross_snapshot" && artifacts[0] !== undefined)
        artifacts[0] = {
          ...artifacts[0],
          snapshotId: "00000000-0000-4000-8000-000000000998",
        };

      // When
      const result = await persistAuthoritativeReport(
        { cas, persistence },
        { ...valid, artifacts },
      );

      // Then
      expect(result.kind).toBe("blocked");
      expect(cas.putCount).toBe(0);
      expect(persistence.saved).toHaveLength(0);
    },
  );

  it("rejects caller-forged chair prose not present in the persisted prompt", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const first = valid.chair.sections[0];
    if (first === undefined) throw new TypeError("missing chair section");
    const chair = {
      ...valid.chair,
      sections: [
        {
          ...first,
          publicSummary: { en: "Invented fact.", ko: "조작된 사실입니다." },
        },
        ...valid.chair.sections.slice(1),
      ],
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, chair },
    );

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "chair_content_mismatch",
    });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("accepts an authenticated bilingual paraphrase grounded in either locale", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const first = valid.chair.sections[0];
    if (first === undefined) throw new TypeError("missing chair section");
    const chair = {
      ...valid.chair,
      sections: [
        {
          ...first,
          publicSummary: {
            en: first.publicSummary.en,
            ko: "같은 근거를 자연스러운 한국어 표현으로 다시 종합했습니다.",
          },
        },
        ...valid.chair.sections.slice(1),
      ],
    };
    await seedAuthoritativeParents(cas, valid);

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, chair },
    );

    // Then
    expect(result.kind, JSON.stringify(result)).toBe("published");
    expect(persistence.saved).toHaveLength(1);
  });

  it("rejects an unauthenticated parent digest and non-contiguous version", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, valid);
    const firstParent = valid.parentArtifacts[0];
    if (firstParent === undefined) throw new TypeError("missing report parent");

    // When
    const badDigest = await persistAuthoritativeReport(
      { cas, persistence },
      {
        ...valid,
        parentArtifacts: [
          { ...firstParent, digest: "f".repeat(64) },
          ...valid.parentArtifacts.slice(1),
        ],
      },
    );
    const skippedVersion = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, version: 2 },
    );

    // Then
    expect(badDigest).toEqual({
      kind: "blocked",
      reason: "parent_artifact_authentication_failed",
    });
    expect(skippedVersion).toEqual({
      kind: "blocked",
      reason: "version_lineage_mismatch",
    });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("atomically links the CAS report, all parents, and contiguous SQLite version one", async () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const cas = new CountingArtifactCasFake();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);
    store.createRun({
      runId: RunIdSchema.parse(input.structuralAudit.runId),
      snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000800"),
        kind: "research",
        logicalKey: "authoritative-report-test",
        inputHash: "a".repeat(64),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse("00000000-0000-4000-8000-000000000801"),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    for (const parent of input.parentArtifacts)
      store.saveArtifactMetadata({
        artifactId: ArtifactIdSchema.parse(parent.artifactId),
        runId: RunIdSchema.parse(input.structuralAudit.runId),
        snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
        contentHash: parent.digest,
        byteLength: parent.seed.length,
        mediaType: "application/json",
        logicalKey: `parent:${parent.artifactId}`,
        inputHash: parent.digest,
        createdAt: "2026-07-23T00:00:00.000Z",
      });

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence: sqliteReportVersionPersistence(store) },
      input,
    );

    // Then
    const database = new Database(temporary.path);
    const counts = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM report_versions) AS versions,
        (SELECT COUNT(*) FROM artifact_edges WHERE relation = 'derived-from') AS edges,
        (SELECT version FROM report_versions LIMIT 1) AS version`)
      .get();
    database.close();
    store.close();
    rmSync(temporary.directory, { recursive: true, force: true });
    expect(result.kind).toBe("published");
    expect(counts).toEqual({ versions: 1, edges: 14, version: 1 });
  });

  it("rolls back SQLite report metadata and version when a parent edge is missing", async () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const cas = new CountingArtifactCasFake();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);
    store.createRun({
      runId: RunIdSchema.parse(input.structuralAudit.runId),
      snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000810"),
        kind: "research",
        logicalKey: "authoritative-report-rollback-test",
        inputHash: "b".repeat(64),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse("00000000-0000-4000-8000-000000000811"),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    for (const parent of input.parentArtifacts.slice(1))
      store.saveArtifactMetadata({
        artifactId: ArtifactIdSchema.parse(parent.artifactId),
        runId: RunIdSchema.parse(input.structuralAudit.runId),
        snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
        contentHash: parent.digest,
        byteLength: parent.seed.length,
        mediaType: "application/json",
        logicalKey: `parent:${parent.artifactId}`,
        inputHash: parent.digest,
        createdAt: "2026-07-23T00:00:00.000Z",
      });

    // When
    const action = async () =>
      await persistAuthoritativeReport(
        { cas, persistence: sqliteReportVersionPersistence(store) },
        input,
      );

    // Then
    await expect(action).rejects.toThrow(/FOREIGN KEY/);
    const database = new Database(temporary.path);
    const counts = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM report_versions) AS versions,
        (SELECT COUNT(*) FROM artifacts WHERE logical_key LIKE 'report_version:%') AS reports`)
      .get();
    database.close();
    store.close();
    rmSync(temporary.directory, { recursive: true, force: true });
    expect(counts).toEqual({ versions: 0, reports: 0 });
  });

  it("publishes only the authenticated accepted chair and terminates the real run atomically", async () => {
    // Given
    const prepared = await createPreparedChairRound("none");
    const chair = createSqliteChairSynthesis(prepared.options);
    await chair.stage({ runId: prepared.runId });
    await chair.drain(prepared.runId);
    await chair.close();
    const database = new Database(prepared.options.databasePath);
    const fence = z
      .object({
        artifact_id: z.string().uuid(),
        owner_id: z.string(),
        fence_token: z.number().int().positive(),
        ordinal: z.number().int().positive(),
        job_id: z.string().uuid(),
        attempt_id: z.string().uuid(),
        envelope_json: z.string(),
      })
      .parse(
        database
          .prepare(`SELECT agent_output_commits.artifact_id,
      agent_output_commits.owner_id, agent_output_commits.fence_token,
      agent_output_commits.ordinal, agent_output_commits.envelope_json,
      attempts.job_id, attempts.attempt_id
      FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
          .get(prepared.runId),
      );
    const chairOutput = ChairSynthesisOutputSchema.parse(
      z
        .object({ payload: z.unknown() })
        .passthrough()
        .parse(JSON.parse(fence.envelope_json)).payload,
    );
    const job = z.object({ result_json: z.string() }).parse(
      database
        .prepare(`SELECT result_json FROM idempotency_records
        WHERE scope = 'chair-synthesis-job' AND idempotency_key = ?`)
        .get(prepared.runId),
    );
    const prompt = ChairSynthesisPromptSchema.parse(
      JSON.parse(
        z.object({ prompt: z.string() }).parse(JSON.parse(job.result_json))
          .prompt,
      ),
    );
    database.close();

    // When
    const result = await publishAuthoritativeReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
        now: () => "2026-07-23T00:10:00.000Z",
      },
      {
        runId: prepared.runId,
        acceptedChairArtifactId: fence.artifact_id,
        fence: {
          jobId: fence.job_id,
          attemptId: fence.attempt_id,
          ordinal: fence.ordinal,
          ownerId: fence.owner_id,
          token: fence.fence_token,
        },
      },
    );

    // Then
    const published = new Database(prepared.options.databasePath);
    const state = published
      .prepare(`SELECT runs.status, runs.report_id,
      runs.report_published_at,
      (SELECT COUNT(*) FROM report_versions) AS versions,
      (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events,
      (SELECT payload_json FROM run_events
        WHERE event_type = 'report_published') AS payload_json
      FROM runs WHERE run_id = ?`)
      .get(prepared.runId);
    published.close();
    expect(result).toMatchObject({ kind: "published" });
    if (result.kind !== "published") return;
    const storedReport = await prepared.options.cas.get(
      ArtifactDigestSchema.parse(result.digest),
    );
    const report = ResearchReportSchema.parse(
      JSON.parse(new TextDecoder().decode(storedReport?.bytes)),
    );
    const operational = report.locales.en.scenarios[0];
    const dissent = report.locales.en.dissent[0];
    const scenarioSentence = prompt.sentences.find(
      (sentence) => sentence.sentenceId === prompt.scenarioIds[0],
    );
    expect(operational?.id).toBe(prompt.scenarioIds[0]);
    expect(report.locales.ko.scenarios[0]?.name).toBe(
      scenarioSentence?.text.ko,
    );
    expect(
      report.locales.en.sections.map((section) => section.sourceIds),
    ).toEqual(chairOutput.sections.map((section) => section.sourceArtifactIds));
    if (dissent === undefined) throw new TypeError("missing retained dissent");
    const dissentSentence = prompt.sentences.find(
      (sentence) =>
        sentence.kind === "dissent" &&
        sentence.claimIds.includes(dissent.claimId),
    );
    expect(dissent).toMatchObject({
      text: dissentSentence?.text.en,
      sourceIds: dissentSentence?.sourceArtifactIds,
    });
    expect(
      report.sources.every(
        (source) =>
          source.publisher !== "authenticated_artifact" &&
          source.retrievedAt !== "1970-01-01T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(state).toMatchObject({
      status: "complete-with-limitations",
      versions: 1,
      events: 1,
      report_published_at: "2026-07-23T00:10:00.000Z",
    });
    const publicationPayload = JSON.parse(
      z.object({ payload_json: z.string() }).parse(state).payload_json,
    );
    expect(publicationPayload).toEqual({
      schemaVersion: "workflow-v1",
      reportId: result.reportId,
      reportVersionId: result.versionId,
      artifactId: result.artifactId,
      participantIds: [],
      summary: {
        en: "Research report published.",
        ko: "리서치 보고서가 발행됐습니다.",
      },
      claimIds: report.claims.map((claim) => claim.claimId),
      sourceIds: report.sources.map((source) => source.sourceId),
      limitationIds: report.limitations.map((limitation) => limitation.id),
    });
    prepared.cleanup();
  }, 20_000);

  it.each(["stale_fence", "wrong_artifact"])(
    "leaves zero publication state for %s authority",
    async (fault) => {
      // Given
      const prepared = await createPreparedChairRound("none");
      const chair = createSqliteChairSynthesis(prepared.options);
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const database = new Database(prepared.options.databasePath);
      const accepted = z
        .object({
          artifact_id: z.string().uuid(),
          owner_id: z.string(),
          fence_token: z.number().int().positive(),
          ordinal: z.number().int().positive(),
          job_id: z.string().uuid(),
          attempt_id: z.string().uuid(),
        })
        .parse(
          database
            .prepare(`SELECT agent_output_commits.artifact_id,
              agent_output_commits.owner_id, agent_output_commits.fence_token,
              agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
              FROM agent_output_commits JOIN attempts USING(attempt_id)
              WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
            .get(prepared.runId),
        );
      database.close();

      // When
      const result = await publishAuthoritativeReportForRun(
        {
          databasePath: prepared.options.databasePath,
          cas: prepared.options.cas,
        },
        {
          runId: prepared.runId,
          acceptedChairArtifactId:
            fault === "wrong_artifact"
              ? "00000000-0000-4000-8000-000000009999"
              : accepted.artifact_id,
          fence: {
            jobId: accepted.job_id,
            attemptId: accepted.attempt_id,
            ordinal: accepted.ordinal,
            ownerId: accepted.owner_id,
            token:
              fault === "stale_fence"
                ? accepted.fence_token + 1
                : accepted.fence_token,
          },
        },
      );

      // Then
      const stored = new Database(prepared.options.databasePath);
      const state = stored
        .prepare(`SELECT runs.status, runs.report_id,
          (SELECT COUNT(*) FROM report_versions) AS versions,
          (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events
          FROM runs WHERE run_id = ?`)
        .get(prepared.runId);
      stored.close();
      prepared.cleanup();
      expect(result).toEqual({
        kind: "incomplete",
        reason: "authority_authentication_failed",
      });
      expect(state).toEqual({
        status: "running",
        report_id: null,
        versions: 0,
        events: 0,
      });
    },
    20_000,
  );

  it("leaves zero publication state when a post-chair authenticated source is tampered", async () => {
    // Given
    const prepared = await createPreparedChairRound("none");
    const chair = createSqliteChairSynthesis(prepared.options);
    await chair.stage({ runId: prepared.runId });
    await chair.drain(prepared.runId);
    await chair.close();
    const database = new Database(prepared.options.databasePath);
    const accepted = z
      .object({
        artifact_id: z.string().uuid(),
        owner_id: z.string(),
        fence_token: z.number().int().positive(),
        ordinal: z.number().int().positive(),
        job_id: z.string().uuid(),
        attempt_id: z.string().uuid(),
      })
      .parse(
        database
          .prepare(`SELECT agent_output_commits.artifact_id,
          agent_output_commits.owner_id, agent_output_commits.fence_token,
          agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
          FROM agent_output_commits JOIN attempts USING(attempt_id)
          WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
          .get(prepared.runId),
      );
    const source = z.object({ logical_key: z.string() }).parse(
      database
        .prepare(`SELECT logical_key FROM artifacts WHERE run_id = ?
          AND logical_key LIKE 'consolidation:%' ORDER BY logical_key LIMIT 1`)
        .get(prepared.runId),
    );
    database.close();
    await corruptAcceptedEnvelope(
      prepared.options.databasePath,
      prepared.options.cas,
      prepared.runId,
      source.logical_key,
    );

    // When
    const result = await publishAuthoritativeReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
      },
      {
        runId: prepared.runId,
        acceptedChairArtifactId: accepted.artifact_id,
        fence: {
          jobId: accepted.job_id,
          attemptId: accepted.attempt_id,
          ordinal: accepted.ordinal,
          ownerId: accepted.owner_id,
          token: accepted.fence_token,
        },
      },
    );

    // Then
    const stored = new Database(prepared.options.databasePath);
    const state = stored
      .prepare(`SELECT runs.status, runs.report_id,
      (SELECT COUNT(*) FROM report_versions) AS versions,
      (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events
      FROM runs WHERE run_id = ?`)
      .get(prepared.runId);
    stored.close();
    prepared.cleanup();
    expect(result).toEqual({
      kind: "incomplete",
      reason: "authority_authentication_failed",
    });
    expect(state).toEqual({
      status: "running",
      report_id: null,
      versions: 0,
      events: 0,
    });
  }, 20_000);
});
