import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createOfficialAttemptHandler,
  createOfficialChairSynthesis,
} from "../compositions/officialWorker";
import { createLeaseEngine } from "../worker/leaseEngine";
import { createSqliteChairSynthesis } from "./chairSynthesis";
import {
  corruptAcceptedEnvelope,
  createPreparedChairRound,
  exhaustChairReplacementBudget,
  mixedClaimValidationFixture,
} from "./chairSynthesis.testSupport";
import { validChairCandidate } from "./chairSynthesisHandler";
import { rewriteStructuralEnvelope } from "./semanticAuditPersistence.testSupport";

async function runFault(fault: Parameters<typeof createPreparedChairRound>[0]) {
  const fixture = await createPreparedChairRound(fault);
  const chair = createSqliteChairSynthesis(fixture.options);
  try {
    const staged = await chair.stage({ runId: fixture.runId });
    const replay = await chair.drain(fixture.runId);
    return { fixture, staged, replay };
  } finally {
    await chair.close();
    fixture.cleanup();
  }
}

describe("Dr. Park constrained chair synthesis", () => {
  it("commits one ID-bound bilingual synthesis after the accepted audit", async () => {
    // Given
    const fixture = await createPreparedChairRound("none");
    const chair = createSqliteChairSynthesis(fixture.options);

    // When
    const staged = await chair.stage({ runId: fixture.runId });
    const replay = await chair.drain(fixture.runId);
    await chair.close();
    fixture.cleanup();

    // Then
    expect(staged).toEqual({ kind: "staged" });
    expect(replay.receipts).toEqual([
      expect.objectContaining({ ordinal: 25, outcome: "accepted" }),
    ]);
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.sectionIds).toEqual([
      "ten_second_brief",
      "supported_analysis",
      "operational_scenarios",
      "dissent_unknowns",
      "change_conditions",
    ]);
    expect(replay.characterActorId).toBe("chair");
    expect(fixture.codex.chairLaunches).toBe(1);
  });

  it.each([
    "invent_price",
    "invent_number",
    "invent_claim",
    "invent_source",
    "invent_probability",
    "invent_recommendation",
    "drop_position",
    "drop_dissent",
    "drop_unknown",
    "ko_mismatch",
  ] as const)(
    "rejects %s and accepts at most one clean replacement",
    async (fault) => {
      // Given / When
      const { fixture, replay } = await runFault(fault);

      // Then
      expect(
        replay.receipts.map((receipt) => [receipt.ordinal, receipt.outcome]),
      ).toEqual([
        [24, "invalid_schema"],
        [25, "accepted"],
      ]);
      expect(replay.artifactIds).toHaveLength(1);
      expect(replay.characterActorId).toBe("chair");
      expect(fixture.codex.chairLaunches).toBe(2);
    },
  );

  it.each([
    "invalid_first",
    "crash_first",
    "lost_first",
    "uncertain_first",
  ] as const)(
    "burns the first ordinal after %s and uses one new-ordinal replacement",
    async (fault) => {
      // Given / When
      const { fixture, replay } = await runFault(fault);

      // Then
      expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([
        24, 25,
      ]);
      expect(replay.receipts.every((receipt) => receipt.evidenceRecorded)).toBe(
        true,
      );
      expect(replay.artifactIds).toHaveLength(1);
      expect(fixture.codex.chairLaunches).toBe(2);
    },
  );

  it("stops after a failed replacement without a third launch or chair bubble", async () => {
    // Given / When
    const { fixture, replay } = await runFault("invalid");

    // Then
    expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([24, 25]);
    expect(replay.artifactIds).toHaveLength(0);
    expect(replay.incompleteReason).toBe("replacement_exhausted");
    expect(replay.characterActorId).toBeNull();
    expect(replay.publishable).toBe(false);
    expect(fixture.codex.chairLaunches).toBe(2);
  });

  it("continues with disclosed limitations from a partial semantic audit", async () => {
    // Given / When
    const { fixture, staged, replay } = await runFault("semantic_partial");

    // Then
    expect(staged).toEqual({ kind: "staged" });
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.characterActorId).toBe("chair");
    expect(fixture.codex.chairLaunches).toBe(1);
  });

  it("dispatches the reserved chair through the real official worker", async () => {
    // Given
    const fixture = await createPreparedChairRound("none");
    let publishedChairArtifactId: string | undefined;
    const stagedChair = createOfficialChairSynthesis(fixture.options);
    await stagedChair.stage({ runId: fixture.runId });
    await stagedChair.close();
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: fixture.root,
        databasePath: fixture.options.databasePath,
        ownerId: "official-chair-worker",
      },
      {
        cas: fixture.options.cas,
        codex: fixture.codex,
        now: fixture.options.now,
        publishReport: (request) => {
          publishedChairArtifactId = request.acceptedChairArtifactId;
          return Promise.resolve({ kind: "published" });
        },
      },
    );
    const engine = createLeaseEngine({
      databasePath: fixture.options.databasePath,
      ownerId: "official-chair-worker",
      handler: official.handler,
      clock: { now: fixture.options.now },
    });

    // When
    for (;;) {
      const result = await engine.poll();
      if (result.kind === "idle") break;
    }
    const replayReader = createOfficialChairSynthesis(fixture.options);
    const replay = replayReader.replay(fixture.runId);

    // Then
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts).toEqual([
      expect.objectContaining({ ordinal: 24, outcome: "accepted" }),
    ]);
    expect(replay.characterActorId).toBe("chair");
    expect(publishedChairArtifactId).toBe(replay.artifactIds[0]);
    await replayReader.close();
    await engine.shutdown();
    await official.close();
    fixture.cleanup();
  });

  it("publishes the accepted chair through the official worker's production callback", async () => {
    // Given
    const fixture = await createPreparedChairRound("none");
    const stagedChair = createOfficialChairSynthesis(fixture.options);
    await stagedChair.stage({ runId: fixture.runId });
    await stagedChair.close();
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: fixture.root,
        databasePath: fixture.options.databasePath,
        ownerId: "official-chair-publisher",
      },
      {
        cas: fixture.options.cas,
        codex: fixture.codex,
        now: fixture.options.now,
      },
    );
    const engine = createLeaseEngine({
      databasePath: fixture.options.databasePath,
      ownerId: "official-chair-publisher",
      handler: official.handler,
      clock: { now: fixture.options.now },
    });

    // When
    for (;;) {
      const result = await engine.poll();
      if (result.kind === "idle") break;
    }
    const database = new Database(fixture.options.databasePath);
    const publication = database
      .prepare(`SELECT runs.status, runs.report_id,
        (SELECT COUNT(*) FROM report_versions) AS versions,
        (SELECT COUNT(*) FROM run_events
          WHERE event_type = 'report_published') AS events
        FROM runs WHERE run_id = ?`)
      .get(fixture.runId);
    database.close();

    // Then
    expect(publication).toMatchObject({
      status: "complete-with-limitations",
      report_id: expect.any(String),
      versions: 1,
      events: 1,
    });
    await engine.shutdown();
    await official.close();
    fixture.cleanup();
  }, 20_000);

  it("finishes incomplete without a replacement when the shared budget is exhausted", async () => {
    // Given
    const fixture = await createPreparedChairRound("invalid_first");
    exhaustChairReplacementBudget(fixture.options.databasePath, fixture.runId);
    const chair = createSqliteChairSynthesis(fixture.options);
    await chair.stage({ runId: fixture.runId });

    // When
    const replay = await chair.drain(fixture.runId);

    // Then
    expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([24]);
    expect(replay.artifactIds).toHaveLength(0);
    expect(replay.incompleteReason).toBe("chair_artifact_missing");
    expect(replay.characterActorId).toBeNull();
    expect(fixture.codex.chairLaunches).toBe(1);
    await chair.close();
    fixture.cleanup();
  });

  it.each(["consolidation:market", "response_ballot:risk"])(
    "rejects a content-hash-valid but unauthenticated %s envelope before reservation",
    async (logicalKey) => {
      // Given
      const fixture = await createPreparedChairRound("none");
      await corruptAcceptedEnvelope(
        fixture.options.databasePath,
        fixture.options.cas,
        fixture.runId,
        logicalKey,
      );
      const chair = createSqliteChairSynthesis(fixture.options);

      // When
      const staged = await chair.stage({ runId: fixture.runId });
      const replay = chair.replay(fixture.runId);

      // Then
      expect(staged).toEqual({
        kind: "blocked",
        reason: "audited_inputs_incomplete",
      });
      expect(replay.receipts).toHaveLength(0);
      expect(replay.artifactIds).toHaveLength(0);
      expect(fixture.codex.chairLaunches).toBe(0);
      await chair.close();
      fixture.cleanup();
    },
  );

  it("rejects a structural audit whose persisted envelope hash no longer authenticates", async () => {
    // Given
    const fixture = await createPreparedChairRound("none");
    const database = new Database(fixture.options.databasePath);
    const row = z
      .object({ artifact_id: z.string().uuid() })
      .parse(
        database
          .prepare(
            "SELECT artifact_id FROM artifacts WHERE run_id = ? AND logical_key = 'structural_audit:system'",
          )
          .get(fixture.runId),
      );
    database.close();
    await rewriteStructuralEnvelope(
      {
        databasePath: fixture.options.databasePath,
        cas: fixture.options.cas,
        structuralArtifactId: row.artifact_id,
      },
      (envelope) => ({ ...envelope, auditHash: "f".repeat(64) }),
    );
    const chair = createSqliteChairSynthesis(fixture.options);

    // When
    const staged = await chair.stage({ runId: fixture.runId });

    // Then
    expect(staged).toEqual({
      kind: "blocked",
      reason: "audited_inputs_incomplete",
    });
    expect(fixture.codex.chairLaunches).toBe(0);
    await chair.close();
    fixture.cleanup();
  });

  it("derives mixed claim relations from selected sentences and preserves distinct Korean scenario text", () => {
    // Given
    const { prompt, candidate, claimB } = mixedClaimValidationFixture();
    const brief = candidate.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    const scenario = candidate.sections.find(
      (section) => section.sectionKey === "operational_scenarios",
    );
    if (brief === undefined || scenario === undefined)
      throw new TypeError("mixed-claim chair fixture is incomplete");

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), candidate);
    const broadCitation = {
      ...candidate,
      sourceArtifactIds: [claimB],
      dissentClaimIds: [],
      unknowns: candidate.unknowns.map(() => ({
        en: "Paraphrased unknown",
        ko: "바꿔 쓴 미확인 항목",
      })),
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              sourceArtifactIds: [claimB],
              auditedClaimIds: [...section.auditedClaimIds, claimB],
            }
          : section,
      ),
    };
    const canonicalized = validChairCandidate(
      JSON.stringify(prompt),
      broadCitation,
    );

    // Then
    expect(accepted).toEqual(candidate);
    expect(brief.auditedClaimIds).toHaveLength(1);
    expect(scenario.auditedClaimIds).toEqual([]);
    expect(scenario.publicSummary.en).toBe("Revenue: 100");
    expect(scenario.publicSummary.ko).toBe("매출: 100");
    expect(canonicalized).toEqual(accepted);
  });

  it("allows retained dissent to ground a condition that would change the chair's view", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const dissent = prompt.sentences.find(
      (sentence) => sentence.kind === "dissent",
    );
    if (dissent === undefined)
      throw new TypeError("chair fixture must include retained dissent");
    const withDissentCondition = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "change_conditions"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, dissent.sentenceId],
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(
      JSON.stringify(prompt),
      withDissentCondition,
    );

    // Then
    expect(accepted).not.toEqual({});
  });

  it("allows retained dissent to qualify the supported analysis", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const dissent = prompt.sentences.find(
      (sentence) => sentence.kind === "dissent",
    );
    if (dissent === undefined)
      throw new TypeError("chair fixture must include retained dissent");
    const qualifiedCandidate = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "supported_analysis"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, dissent.sentenceId],
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(
      JSON.stringify(prompt),
      qualifiedCandidate,
    );

    // Then
    expect(accepted).not.toEqual({});
  });

  it.each(["supported_analysis", "operational_scenarios"] as const)(
    "allows an audited unknown to qualify %s",
    (sectionKey) => {
      // Given
      const { prompt, candidate } = mixedClaimValidationFixture();
      const unknown = prompt.sentences.find(
        (sentence) => sentence.kind === "unknown",
      );
      if (unknown === undefined)
        throw new TypeError("chair fixture must include an audited unknown");
      const qualifiedCandidate = {
        ...candidate,
        sections: candidate.sections.map((section) =>
          section.sectionKey === sectionKey
            ? {
                ...section,
                sentenceIds: [...section.sentenceIds, unknown.sentenceId],
              }
            : section,
        ),
      };

      // When
      const accepted = validChairCandidate(
        JSON.stringify(prompt),
        qualifiedCandidate,
      );

      // Then
      expect(accepted).not.toEqual({});
    },
  );

  it("allows the market team position to ground operational scenarios", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const marketPosition = prompt.sentences.find(
      (sentence) => sentence.sentenceId === "position:market",
    );
    if (marketPosition === undefined)
      throw new TypeError("chair fixture must include the market position");
    const scenarioCandidate = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "operational_scenarios"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, marketPosition.sentenceId],
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(
      JSON.stringify(prompt),
      scenarioCandidate,
    );

    // Then
    expect(accepted).not.toEqual({});
  });

  it("keeps publication state empty when the trusted post-chair publisher is incomplete", async () => {
    // Given
    const fixture = await createPreparedChairRound("none");
    let publicationCalls = 0;
    const chair = createSqliteChairSynthesis({
      ...fixture.options,
      publishReport: () => {
        publicationCalls += 1;
        return Promise.resolve({ kind: "incomplete" });
      },
    });
    await chair.stage({ runId: fixture.runId });

    // When
    const replay = await chair.drain(fixture.runId);
    const database = new Database(fixture.options.databasePath);
    const state = z.object({ versions: z.number(), events: z.number() }).parse(
      database
        .prepare(`SELECT
            (SELECT COUNT(*) FROM report_versions) AS versions,
            (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events`)
        .get(),
    );
    database.close();

    // Then
    expect(publicationCalls).toBe(1);
    expect(replay.artifactIds).toHaveLength(1);
    expect(state).toEqual({ versions: 0, events: 0 });
    await chair.close();
    fixture.cleanup();
  });
});
