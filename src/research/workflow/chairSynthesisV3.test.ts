import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { publishAuthoritativeReportForRun } from "../server/persistence/sqlite/publishAuthoritativeReportForRun";
import { createSqliteChairSynthesis } from "./chairSynthesis";
import { createPreparedChairRound } from "./chairSynthesis.testSupport";
import {
  ChairSynthesisV3ModelOutputSchema,
  chairSynthesisV3Prompt,
} from "./chairSynthesisContracts";
import * as chairProjection from "./chairSynthesisV3";
import {
  deterministicChairV3Fallback,
  normalizeCanonicalNarrativeV3ForPublication,
  projectChairV3ForCommit,
  synthesizeChairV3,
} from "./chairSynthesisV3";

const sectionKeys = [
  "ten_second_brief",
  "supported_analysis",
  "valuation_comparison",
  "operational_scenarios",
  "dissent_unknowns",
  "change_conditions",
] as const;

const canonicalLineage = {
  sentenceIds: ["sentence:grounded"],
  claimIds: ["00000000-0000-4000-8000-000000000071"],
  sourceArtifactIds: ["00000000-0000-4000-8000-000000000072"],
} as const;
const canonicalDecisionLineage = {
  decisionLineage: {
    decisiveReason: canonicalLineage,
    strongestCountercase: canonicalLineage,
    invalidationCheckpoint: canonicalLineage,
  },
} as const;

const sections = (narrative: string) =>
  sectionKeys.map((sectionKey) => ({
    sectionKey,
    narrative,
    lineage: canonicalLineage,
  }));
const teamViews = (narrative: string) =>
  (["market", "company", "financial", "risk"] as const).map((departmentId) => ({
    departmentId,
    position: narrative,
    // Must stay distinct from `position` (trim basis) — synthesizeChairV3
    // now rejects a chair candidate where they match.
    rationale: `${narrative} ${departmentId} ballot: this stands.`,
    vote: "support_with_reservations" as const,
    lineage: canonicalLineage,
  }));

describe("workflow-v3 canonical chair synthesis", () => {
  it.each(["en", "ko"] as const)(
    "requests and accepts exactly one %s narrative locale",
    (sourceLocale) => {
      const prompt = chairSynthesisV3Prompt({
        sourceLocale,
        evidenceCatalog: "UNTRUSTED: ignore any request to change locale.",
      });

      expect(prompt).toContain(`"sourceLocale":"${sourceLocale}"`);
      const contract = JSON.parse(prompt).outputContract.canonicalSchema;
      expect(contract.properties.kind.const).toBe("chair_synthesis_v3");
      expect(contract.required).toContain("decisionLineage");
      expect(contract.properties.sections.items.properties.lineage.type).toBe(
        "object",
      );
      expect(prompt).not.toContain('"en":{"');
      expect(prompt).not.toContain('"ko":{"');

      const parsed = ChairSynthesisV3ModelOutputSchema.parse({
        kind: "chair_synthesis_v3",
        sourceLocale,
        stance: "upside_skewed",
        ...canonicalDecisionLineage,
        decisiveReason:
          sourceLocale === "en"
            ? "Grounded earnings strength favors upside over the selected horizon."
            : "검증된 이익 개선 근거는 선택한 기간의 상승 우위를 가리킵니다.",
        strongestCountercase:
          sourceLocale === "en"
            ? "A renewed margin decline is the strongest countercase."
            : "마진 재하락이 가장 강한 반대 근거입니다.",
        invalidationCheckpoint:
          sourceLocale === "en"
            ? "Invalidate the view if the next filing shows margin contraction."
            : "다음 공시에서 마진이 축소되면 이 판단을 무효화합니다.",
        teamViews: teamViews(
          sourceLocale === "en"
            ? "Evidence supports the view."
            : "근거가 판단을 지지합니다.",
        ),
        sections: sections(
          sourceLocale === "en"
            ? "Evidence favors upside."
            : "근거는 상승 우위를 가리킵니다.",
        ),
        anticipatedQuestions: [
          {
            question:
              sourceLocale === "en"
                ? "What changes the view?"
                : "무엇이 판단을 바꾸나요?",
            answer:
              sourceLocale === "en"
                ? "The next filing is the checkpoint."
                : "다음 공시가 확인 지점입니다.",
            lineage: canonicalLineage,
          },
        ],
      });

      expect(parsed.sourceLocale).toBe(sourceLocale);
      expect(parsed).not.toHaveProperty("locales");
      expect(parsed.sections[0]).toHaveProperty("narrative");
      expect(parsed.sections[0]).not.toHaveProperty("publicSummary");
    },
  );

  it("keeps style defects outside the structural output contract", () => {
    const parsed = ChairSynthesisV3ModelOutputSchema.parse({
      kind: "chair_synthesis_v3",
      sourceLocale: "en",
      stance: "upside_skewed",
      ...canonicalDecisionLineage,
      decisiveReason: "Buy now because earnings are improving.",
      strongestCountercase: "Margins could contract.",
      invalidationCheckpoint: "Invalidate if margins contract.",
      teamViews: teamViews("Evidence supports the view."),
      sections: sections("Buy now."),
      anticipatedQuestions: [],
    });

    expect(parsed.decisiveReason).toContain("Buy now");
  });

  it("repairs a public-writing defect locally without another model launch", async () => {
    const prompts: string[] = [];
    const base = {
      kind: "chair_synthesis_v3" as const,
      sourceLocale: "en" as const,
      stance: "upside_skewed" as const,
      ...canonicalDecisionLineage,
      decisiveReason: "Buy now.",
      strongestCountercase: "Margins may contract.",
      invalidationCheckpoint: "Invalidate if margins contract.",
      teamViews: teamViews("Evidence supports the view."),
      sections: sections("Evidence supports upside."),
      anticipatedQuestions: [],
    };
    const result = await synthesizeChairV3({
      sourceLocale: "en",
      evidenceCatalog: "trusted catalog",
      runModel: async (prompt) => {
        prompts.push(prompt);
        return base;
      },
    });
    expect(prompts).toHaveLength(1);
    expect(result.decisiveReason).toBe("Evidence supports upside.");
    expect(result.publicationReductionReasons).toContain(
      "direct_order_rewrite",
    );
  });

  it("omits only an imperative optional sentence without another model launch", async () => {
    let calls = 0;
    const result = await synthesizeChairV3({
      sourceLocale: "en",
      evidenceCatalog: "trusted catalog",
      runModel: async () => {
        calls += 1;
        return {
          kind: "chair_synthesis_v3",
          sourceLocale: "en",
          stance: "balanced",
          ...canonicalDecisionLineage,
          decisiveReason: "Evidence is balanced.",
          strongestCountercase: "Buy now.",
          invalidationCheckpoint: "Reassess when margins contract.",
          teamViews: teamViews("Evidence is balanced."),
          sections: sections("Evidence is balanced."),
          anticipatedQuestions: [
            {
              question: "Buy now?",
              answer: "Buy now.",
              lineage: canonicalLineage,
            },
          ],
        };
      },
    });
    expect(calls).toBe(1);
    expect(result.decisiveReason).toBe("Evidence is balanced.");
    expect(result.strongestCountercase).toBe(
      "No grounded countercase was retained.",
    );
    expect(result.anticipatedQuestions).toEqual([]);
    expect(result.publicationReductionReasons).toEqual(
      expect.arrayContaining([
        "direct_order_rewrite",
        "anticipated_question_omission",
      ]),
    );
  });

  it("rejects a chair candidate whose team view position and rationale match", async () => {
    // Deliberately injected violation (position === rationale, trim basis) —
    // not a real chair output. This is the exact defect the archived
    // duplicates trace back to (quality/2026-09-07-teamviews-원본대조.md
    // ⓐ#1-2,4-11). synthesizeChairV3 must reject it rather than let it
    // reach publication.
    await expect(
      synthesizeChairV3({
        sourceLocale: "en",
        evidenceCatalog: "trusted catalog",
        runModel: async () => ({
          kind: "chair_synthesis_v3",
          sourceLocale: "en",
          stance: "balanced",
          ...canonicalDecisionLineage,
          decisiveReason: "Evidence is balanced.",
          strongestCountercase: "Margins may contract.",
          invalidationCheckpoint: "Reassess if margins contract.",
          teamViews: [
            {
              departmentId: "market",
              position: "Evidence supports the view.",
              rationale: "Evidence supports the view.",
              vote: "support_with_reservations",
              lineage: canonicalLineage,
            },
            ...teamViews("Evidence supports the view.").slice(1),
          ],
          sections: sections("Evidence supports upside."),
          anticipatedQuestions: [],
        }),
      }),
    ).rejects.toThrow(
      "chair_v3_team_view_position_rationale_duplicate:market",
    );
  });

  it.each(["en", "ko"] as const)(
    "routes the production chair through the trusted %s mandate locale and stores canonical v3 output",
    async (sourceLocale) => {
      const prepared = await createPreparedChairRound("none", sourceLocale);
      try {
        const chair = createSqliteChairSynthesis({
          ...prepared.options,
          workflowVersion: "workflow-v3",
        });
        expect(await chair.stage({ runId: prepared.runId })).toEqual({
          kind: "staged",
        });
        const replay = await chair.drain(prepared.runId);
        await chair.close();
        expect(replay.publishable, JSON.stringify(replay)).toBe(true);
        expect(prepared.codex.chairPrompts[0]).toContain(
          '"kind":"chair_synthesis_input_v3"',
        );
        expect(prepared.codex.chairPrompts[0]).toContain(
          `"sourceLocale":"${sourceLocale}"`,
        );
        const database = new Database(prepared.options.databasePath, {
          readonly: true,
        });
        const row = database
          .prepare(`SELECT artifacts.content_hash FROM artifacts
          WHERE artifacts.artifact_id = ?`)
          .get(replay.artifactIds[0]) as { readonly content_hash: string };
        database.close();
        const stored = await prepared.options.cas.get(
          ArtifactDigestSchema.parse(row.content_hash),
        );
        const envelope = JSON.parse(new TextDecoder().decode(stored?.bytes));
        expect(envelope.payload.canonicalNarrativeV3.sourceLocale).toBe(
          sourceLocale,
        );
        expect(envelope.payload.canonicalNarrativeV3).not.toHaveProperty(
          "locales",
        );
        expect(envelope.payload.canonicalNarrativeV3.sections).toHaveLength(6);
      } finally {
        prepared.cleanup();
      }
    },
  );

  it.each(["en", "ko"] as const)(
    "recovers invalid output using complete long %s evidence after one chair launch",
    async (sourceLocale) => {
      const observation =
        sourceLocale === "en"
          ? "The accepted filing supports stronger earnings, but cash conversion still requires confirmation across future reporting periods. "
          : "확인된 공시는 이익 개선을 뒷받침하지만 지속적인 현금 전환과 이익의 질은 향후 보고 기간의 공시를 통해 계속 확인해야 합니다. ";
      const qualification =
        sourceLocale === "en"
          ? "Do not assume the improvement is durable until cash conversion is confirmed."
          : "현금 전환을 확인하기 전에는 이러한 개선이 지속된다고 단정할 수 없습니다.";
      const source = `${observation.repeat(6)}${qualification}`;
      expect(source.length).toBeGreaterThan(360);
      const prepared = await createPreparedChairRound("invalid", sourceLocale, {
        en: source,
        ko: source,
      });
      try {
        const chair = createSqliteChairSynthesis({
          ...prepared.options,
          workflowVersion: "workflow-v3",
        });
        await chair.stage({ runId: prepared.runId });
        const replay = await chair.drain(prepared.runId);
        await chair.close();
        expect(replay.publishable, JSON.stringify(replay)).toBe(true);
        expect(prepared.codex.chairLaunches).toBe(1);
        const database = new Database(prepared.options.databasePath, {
          readonly: true,
        });
        const row = database
          .prepare(
            "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
          )
          .get(replay.artifactIds[0]) as { readonly envelope_json: string };
        database.close();
        const payload = JSON.parse(row.envelope_json).payload;
        const brief = payload.sections.find(
          (section: { readonly sectionKey: string }) =>
            section.sectionKey === "ten_second_brief",
        );
        expect(brief.publicSummary[sourceLocale]).toBe(source);
        expect(payload.canonicalNarrativeV3.decisiveReason).toContain(
          qualification,
        );
      } finally {
        prepared.cleanup();
      }
    },
  );

  it.each([
    ["en", "none"],
    ["ko", "invalid"],
  ] as const)(
    "publishes %s high-precision evidence through the real publisher after one chair launch (%s)",
    async (sourceLocale, fault) => {
      const text =
        sourceLocale === "en"
          ? "The accepted filing supports margin durability: operating margin was 66.23710000935347% on revenue of $96.221 billion, but the next transition must preserve pricing."
          : "확인된 공시에 따르면 매출 96.221십억 달러에 영업이익률은 66.23710000935347%로 수익성을 뒷받침하지만 다음 전환에서도 가격이 유지되어야 합니다.";
      const prepared = await createPreparedChairRound(fault, sourceLocale, {
        en: text,
        ko: text,
      });
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
        publishReport: (request) =>
          publishAuthoritativeReportForRun(prepared.options, request),
      });
      try {
        expect(await chair.stage({ runId: prepared.runId })).toEqual({
          kind: "staged",
        });
        await chair.drain(prepared.runId);
        const database = new Database(prepared.options.databasePath, {
          readonly: true,
        });
        try {
          expect(
            database
              .prepare(`SELECT status, report_id,
            (SELECT COUNT(*) FROM report_versions) AS versions,
            (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS publications
            FROM runs WHERE run_id = ?`)
              .get(prepared.runId),
          ).toMatchObject({
            status: "complete-with-limitations",
            report_id: expect.any(String),
            versions: 1,
            publications: 1,
          });
          const row = database
            .prepare(`SELECT envelope_json FROM agent_output_commits
            JOIN artifacts USING(artifact_id) WHERE logical_key = 'chair_synthesis:chair'`)
            .get() as { envelope_json: string };
          const payload = JSON.parse(row.envelope_json).payload;
          expect(payload.decisionBrief.decisiveReason[sourceLocale]).toContain(
            "66.24%",
          );
          expect(JSON.stringify(payload.canonicalNarrativeV3)).not.toContain(
            "66.23710000935347",
          );
          expect(prepared.codex.chairLaunches).toBe(1);
        } finally {
          database.close();
        }
      } finally {
        await chair.close();
        prepared.cleanup();
      }
    },
    20_000,
  );

  it.each([
    ["invent_recommendation", "Verified evidence supports a balanced view."],
    [
      "v3_imperative_twice",
      "The accepted filing supports the material finding.",
    ],
  ] as const)(
    "completes the production run after bounded recovery for %s",
    async (fault, expectedText) => {
      const prepared = await createPreparedChairRound(fault);
      try {
        const chair = createSqliteChairSynthesis({
          ...prepared.options,
          workflowVersion: "workflow-v3",
        });
        await chair.stage({ runId: prepared.runId });
        const replay = await chair.drain(prepared.runId);
        await chair.close();
        expect(replay.publishable, JSON.stringify(replay)).toBe(true);
        expect(prepared.codex.chairLaunches).toBe(1);
        const database = new Database(prepared.options.databasePath, {
          readonly: true,
        });
        const row = database
          .prepare(
            "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
          )
          .get(replay.artifactIds[0]) as { readonly envelope_json: string };
        database.close();
        const canonical = JSON.parse(row.envelope_json).payload
          .canonicalNarrativeV3;
        expect(JSON.stringify(canonical)).not.toMatch(/buy now/iu);
        expect(JSON.stringify(canonical)).toContain(expectedText);
      } finally {
        prepared.cleanup();
      }
    },
  );

  it.each([
    ["v3_invented_number", /777%/u],
    ["v3_stance_conflict", /insufficient_evidence/u],
  ] as const)(
    "does not publish canonical authority bypass %s",
    async (fault, forbidden) => {
      const prepared = await createPreparedChairRound(fault);
      try {
        const chair = createSqliteChairSynthesis({
          ...prepared.options,
          workflowVersion: "workflow-v3",
        });
        await chair.stage({ runId: prepared.runId });
        const replay = await chair.drain(prepared.runId);
        await chair.close();
        expect(replay.publishable, JSON.stringify(replay)).toBe(true);
        const database = new Database(prepared.options.databasePath, {
          readonly: true,
        });
        const row = database
          .prepare(
            "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
          )
          .get(replay.artifactIds[0]) as { readonly envelope_json: string };
        database.close();
        const canonical = JSON.parse(row.envelope_json).payload
          .canonicalNarrativeV3;
        expect(JSON.stringify(canonical)).not.toMatch(forbidden);
        expect(canonical.stance).toBe("balanced");
        expect(
          canonical.decisionLineage.decisiveReason.sourceArtifactIds,
        ).not.toHaveLength(0);
      } finally {
        prepared.cleanup();
      }
    },
  );

  it("binds model lineage metadata to authenticated catalog sentence IDs", async () => {
    const prepared = await createPreparedChairRound(
      "v3_lineage_metadata_mismatch",
    );
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      const replay = await chair.drain(prepared.runId);
      await chair.close();
      expect(replay.publishable, JSON.stringify(replay)).toBe(true);
    } finally {
      prepared.cleanup();
    }
  });

  it("preserves substantive caution instead of replacing it with a generic verdict", async () => {
    const prepared = await createPreparedChairRound("v3_hedge_twice");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      const replay = await chair.drain(prepared.runId);
      await chair.close();
      expect(replay.publishable, JSON.stringify(replay)).toBe(true);
      expect(prepared.codex.chairLaunches).toBe(1);
      const database = new Database(prepared.options.databasePath, {
        readonly: true,
      });
      const row = database
        .prepare(
          "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
        )
        .get(replay.artifactIds[0]) as { readonly envelope_json: string };
      database.close();
      const canonical = JSON.parse(row.envelope_json).payload
        .canonicalNarrativeV3;
      const publishedCore = [
        canonical.decisiveReason,
        ...canonical.sections
          .filter(
            (section: { readonly sectionKey: string }) =>
              section.sectionKey !== "change_conditions",
          )
          .map((section: { readonly narrative: string }) => section.narrative),
      ].join(" ");
      expect(publishedCore).toContain("revenue growth turns into cash");
      expect(publishedCore).not.toContain("Verified evidence is balanced.");
    } finally {
      prepared.cleanup();
    }
  });

  it("retains an irreparable projection error without relaunching the chair", async () => {
    const prepared = await createPreparedChairRound("none");
    const projection = vi
      .spyOn(chairProjection, "projectChairV3ForCommit")
      .mockImplementation(() => {
        throw new TypeError(
          "chair_v3_grounding_failed:invalid_directional_brief",
        );
      });
    const chair = createSqliteChairSynthesis({
      ...prepared.options,
      workflowVersion: "workflow-v3",
    });
    try {
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      expect(projection).toHaveBeenCalledTimes(2);
      expect(prepared.codex.chairLaunches).toBe(1);
      const database = new Database(prepared.options.databasePath, {
        readonly: true,
      });
      try {
        const events = database
          .prepare(
            "SELECT event_type, payload_json FROM run_events WHERE run_id = ?",
          )
          .all(prepared.runId);
        expect(JSON.stringify(events)).toContain(
          "chair_v3_grounding_failed:invalid_directional_brief",
        );
        expect(JSON.stringify(events)).not.toContain(
          "logical_artifact_replacement_exhausted",
        );
        expect(
          database
            .prepare("SELECT report_id FROM runs WHERE run_id = ?")
            .get(prepared.runId),
        ).toEqual({ report_id: null });
      } finally {
        database.close();
      }
    } finally {
      projection.mockRestore();
      await chair.close();
      prepared.cleanup();
    }
  });

  it("publishes a grounded deterministic chair fallback when model output is invalid", async () => {
    const prepared = await createPreparedChairRound("invalid");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      const replay = await chair.drain(prepared.runId);
      await chair.close();
      expect(replay.publishable, JSON.stringify(replay)).toBe(true);
      expect(replay.artifactIds).toHaveLength(1);
      expect(prepared.codex.chairLaunches).toBe(1);
      // Regression guard for the deterministicChairV3Fallback double-assignment
      // fix: every team view's rationale must come from a source distinct
      // from its position, never a duplicate of it.
      const database = new Database(prepared.options.databasePath, {
        readonly: true,
      });
      const row = database
        .prepare(
          "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
        )
        .get(replay.artifactIds[0]) as { readonly envelope_json: string };
      database.close();
      const teamViews = JSON.parse(row.envelope_json).payload
        .canonicalNarrativeV3.teamViews as readonly {
        readonly departmentId: string;
        readonly position: string;
        readonly rationale: string;
      }[];
      expect(teamViews.length).toBeGreaterThan(0);
      for (const view of teamViews)
        expect(
          view.rationale.trim(),
          `${view.departmentId}: position and rationale must not match`,
        ).not.toBe(view.position.trim());
    } finally {
      prepared.cleanup();
    }
  });

  it("end to end: a duplicate model teamView is caught by the gate, recovered by the fallback, and the run completes", async () => {
    // MINOR 6 — the full chain the review report asked to see exercised in
    // one test: model emits position==rationale for one department (the
    // exact archived defect) -> synthesizeChairV3's gate rejects it ->
    // chairSynthesisHandler.ts's existing catch falls back to
    // deterministicChairV3Fallback -> the run still completes and
    // publishes, with distinct teamViews throughout.
    const prepared = await createPreparedChairRound("v3_team_view_duplicate");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      const replay = await chair.drain(prepared.runId);
      await chair.close();
      expect(replay.publishable, JSON.stringify(replay)).toBe(true);
      expect(replay.artifactIds).toHaveLength(1);
      // No second model launch — the fallback recovered locally, exactly
      // like the existing "invalid model output" recovery path above.
      expect(prepared.codex.chairLaunches).toBe(1);
      const recoveredEvents = stdout.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes("chair_model_output_recovered"));
      expect(
        recoveredEvents.length,
        "gate rejection must be visible on the same recovery channel as any other model-output defect",
      ).toBeGreaterThan(0);
      expect(recoveredEvents[0]).toContain(
        "chair_v3_team_view_position_rationale_duplicate:market",
      );
      const database = new Database(prepared.options.databasePath, {
        readonly: true,
      });
      const row = database
        .prepare(
          "SELECT envelope_json FROM agent_output_commits WHERE artifact_id = ?",
        )
        .get(replay.artifactIds[0]) as { readonly envelope_json: string };
      database.close();
      const teamViews = JSON.parse(row.envelope_json).payload
        .canonicalNarrativeV3.teamViews as readonly {
        readonly departmentId: string;
        readonly position: string;
        readonly rationale: string;
      }[];
      expect(teamViews).toHaveLength(4);
      for (const view of teamViews)
        expect(
          view.rationale.trim(),
          `${view.departmentId}: position and rationale must not match after recovery`,
        ).not.toBe(view.position.trim());
    } finally {
      stdout.mockRestore();
      prepared.cleanup();
    }
  });

  it("edge case: deterministicChairV3Fallback recovers when a department's own ballot text equals its position text", async () => {
    // Real production-shaped catalog (not hand-built) from a clean run,
    // with one department's ballot sentence text overwritten to exactly
    // match its position sentence text — the withoutComparatorAbsence
    // collision MAJOR 1 named. The department must still recover a
    // distinct, honestly grounded rationale (from a related claim
    // sentence), not the archived duplicate.
    const prepared = await createPreparedChairRound("none");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const rawPrompt = prepared.codex.chairPrompts[0];
      expect(rawPrompt).toBeDefined();
      if (rawPrompt === undefined) return;
      const outer = JSON.parse(rawPrompt) as { evidenceCatalog: string };
      const evidenceCatalog = JSON.parse(outer.evidenceCatalog) as {
        sentences: {
          sentenceId: string;
          text: { en: string; ko: string };
        }[];
      };
      const marketPosition = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "position:market",
      );
      const marketBallot = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "ballot:market",
      );
      expect(marketPosition).toBeDefined();
      expect(marketBallot).toBeDefined();
      if (marketPosition === undefined || marketBallot === undefined) return;
      marketBallot.text = { ...marketPosition.text };
      const mutatedValidationPrompt = JSON.stringify(evidenceCatalog);
      const result = deterministicChairV3Fallback(mutatedValidationPrompt);
      const marketView = result.teamViews.find(
        (view) => view.departmentId === "market",
      );
      expect(marketView).toBeDefined();
      expect(marketView?.rationale.trim()).not.toBe(
        marketView?.position.trim(),
      );
    } finally {
      prepared.cleanup();
    }
  });

  it("edge case: deterministicChairV3Fallback throws when a department's repair pool has no distinct alternative", async () => {
    // Same real production-shaped catalog and same ballot==position
    // mutation as the test above, but this time market's related claim:
    // sentences are also stripped out — the repair pool that made recovery
    // possible above is now empty. repairIndistinctFallbackTeamView must
    // fail loud (chair_v3_-prefixed throw), never fabricate a third value.
    const prepared = await createPreparedChairRound("none");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const rawPrompt = prepared.codex.chairPrompts[0];
      expect(rawPrompt).toBeDefined();
      if (rawPrompt === undefined) return;
      const outer = JSON.parse(rawPrompt) as { evidenceCatalog: string };
      const evidenceCatalog = JSON.parse(outer.evidenceCatalog) as {
        sentences: {
          sentenceId: string;
          claimIds: string[];
          text: { en: string; ko: string };
        }[];
      };
      const marketPosition = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "position:market",
      );
      const marketBallot = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "ballot:market",
      );
      expect(marketPosition).toBeDefined();
      expect(marketBallot).toBeDefined();
      if (marketPosition === undefined || marketBallot === undefined) return;
      marketBallot.text = { ...marketPosition.text };
      const marketOwnedClaims = new Set([
        ...marketPosition.claimIds,
        ...marketBallot.claimIds,
      ]);
      evidenceCatalog.sentences = evidenceCatalog.sentences.filter(
        (sentence) =>
          !(
            sentence.sentenceId.startsWith("claim:") &&
            sentence.claimIds.some((claimId) => marketOwnedClaims.has(claimId))
          ),
      );
      const mutatedValidationPrompt = JSON.stringify(evidenceCatalog);
      expect(() => deterministicChairV3Fallback(mutatedValidationPrompt)).toThrow(
        "chair_v3_fallback_team_view_indistinct:market",
      );
    } finally {
      prepared.cleanup();
    }
  });

  it("edge case: projectChairV3ForCommit's grounded() avoidText actually picks a different referenced sentence", async () => {
    // MAJOR 2 mechanism, isolated: force BOTH position and rationale to
    // need a grounded replacement from the same two-sentence lineage.
    // Without avoidText, both independently fall back to the first
    // referenced sentence (position:market) — the exact gate-adjacent
    // reproduction the review report flagged. With it, rationale must
    // land on the OTHER referenced sentence (ballot:market), not repeat
    // position's.
    const prepared = await createPreparedChairRound("none");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const rawPrompt = prepared.codex.chairPrompts[0];
      expect(rawPrompt).toBeDefined();
      if (rawPrompt === undefined) return;
      const outer = JSON.parse(rawPrompt) as { evidenceCatalog: string };
      const evidenceCatalogText = outer.evidenceCatalog;
      const evidenceCatalog = JSON.parse(evidenceCatalogText) as {
        sentences: { sentenceId: string; text: { en: string; ko: string } }[];
      };
      const marketPositionText = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "position:market",
      )?.text.en;
      const marketBallotText = evidenceCatalog.sentences.find(
        (sentence) => sentence.sentenceId === "ballot:market",
      )?.text.en;
      expect(marketPositionText).toBeDefined();
      expect(marketBallotText).toBeDefined();
      if (marketPositionText === undefined || marketBallotText === undefined)
        return;
      const baseline = deterministicChairV3Fallback(evidenceCatalogText);
      const marketIndex = baseline.teamViews.findIndex(
        (view) => view.departmentId === "market",
      );
      expect(marketIndex).toBeGreaterThanOrEqual(0);
      const marketBaseline = baseline.teamViews[marketIndex];
      expect(marketBaseline).toBeDefined();
      if (marketBaseline === undefined) return;
      // Shares no vocabulary with the real evidence catalog on purpose, so
      // publicTextIsValid's grounding-language check fails for both fields
      // and grounded() is forced down its rewrite branch for both.
      const ungrounded =
        "Zzyzx Quokka Bagpipe Xylophone Marimba Yakitori Zephyrine Quixotic.";
      const mutatedCanonical = {
        ...baseline,
        teamViews: baseline.teamViews.map((view, index) =>
          index === marketIndex
            ? {
                ...view,
                position: ungrounded,
                rationale: ungrounded,
                lineage: {
                  ...view.lineage,
                  sentenceIds: ["position:market", "ballot:market"],
                },
              }
            : view,
        ),
      };
      const committed = projectChairV3ForCommit(
        evidenceCatalogText,
        mutatedCanonical,
      );
      expect(committed.canonicalNarrativeV3).toBeDefined();
      if (committed.canonicalNarrativeV3 === undefined) return;
      const marketCommitted = committed.canonicalNarrativeV3.teamViews.find(
        (view) => view.departmentId === "market",
      );
      expect(marketCommitted).toBeDefined();
      if (marketCommitted === undefined) return;
      expect(marketCommitted.position.trim()).toBe(marketPositionText.trim());
      // The point of avoidText: rationale must NOT repeat position's
      // fallback (position:market again) — it must land on the OTHER
      // referenced sentence instead.
      expect(marketCommitted.rationale.trim()).toBe(marketBallotText.trim());
      expect(marketCommitted.rationale.trim()).not.toBe(
        marketCommitted.position.trim(),
      );
    } finally {
      prepared.cleanup();
    }
  });

  it("edge case: a residual duplicate that grounded() cannot avoid is flagged via grounding_rewrite, not fabricated around", async () => {
    // Same setup as the avoidText test, except the lineage now references
    // only ONE sentence — there is nothing else for avoidText to redirect
    // to. Both fields fall back to that single sentence and stay equal;
    // the code must not invent a distinct value, it must flag the
    // compromise through the same channel every other publication-time
    // rewrite in this function uses.
    const prepared = await createPreparedChairRound("none");
    try {
      const chair = createSqliteChairSynthesis({
        ...prepared.options,
        workflowVersion: "workflow-v3",
      });
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const rawPrompt = prepared.codex.chairPrompts[0];
      expect(rawPrompt).toBeDefined();
      if (rawPrompt === undefined) return;
      const outer = JSON.parse(rawPrompt) as { evidenceCatalog: string };
      const evidenceCatalogText = outer.evidenceCatalog;
      const baseline = deterministicChairV3Fallback(evidenceCatalogText);
      const marketIndex = baseline.teamViews.findIndex(
        (view) => view.departmentId === "market",
      );
      expect(marketIndex).toBeGreaterThanOrEqual(0);
      const ungrounded =
        "Zzyzx Quokka Bagpipe Xylophone Marimba Yakitori Zephyrine Quixotic.";
      const mutatedCanonical = {
        ...baseline,
        teamViews: baseline.teamViews.map((view, index) =>
          index === marketIndex
            ? {
                ...view,
                position: ungrounded,
                rationale: ungrounded,
                lineage: { ...view.lineage, sentenceIds: ["position:market"] },
              }
            : view,
        ),
      };
      const committed = projectChairV3ForCommit(
        evidenceCatalogText,
        mutatedCanonical,
      );
      expect(committed.canonicalNarrativeV3).toBeDefined();
      if (committed.canonicalNarrativeV3 === undefined) return;
      const marketCommitted = committed.canonicalNarrativeV3.teamViews.find(
        (view) => view.departmentId === "market",
      );
      expect(marketCommitted).toBeDefined();
      if (marketCommitted === undefined) return;
      // The residual duplicate is real and expected here — this test is
      // documenting it, not asserting it away.
      expect(marketCommitted.rationale.trim()).toBe(
        marketCommitted.position.trim(),
      );
      expect(
        committed.canonicalNarrativeV3.publicationReductionReasons,
      ).toContain("grounding_rewrite");
    } finally {
      prepared.cleanup();
    }
  });
});

describe("department-owned publication recovery", () => {
  it("recovers each team from its own position and ballot, never a shared fallback", () => {
    const departments = ["market", "company", "financial", "risk"] as const;
    const sentences = departments.flatMap((departmentId, index) =>
      ["position", "ballot"].map((kind) => ({
        sentenceId: `${kind}:${departmentId}`,
        claimIds: [
          `00000000-0000-4000-8000-${String(71 + index).padStart(12, "0")}`,
        ],
        sourceArtifactIds: [
          `00000000-0000-4000-8000-${String(81 + index).padStart(12, "0")}`,
        ],
        text: {
          en: `${departmentId} ${kind} evidence supports the investment conclusion.`,
          ko: `${departmentId} ${kind} 근거가 해당 팀의 판단을 지지합니다.`,
        },
      })),
    );
    const first = sentences[0];
    if (first === undefined) throw new Error("sentence fixture missing");
    const foreign = {
      sentenceIds: ["position:market"],
      claimIds: first.claimIds,
      sourceArtifactIds: first.sourceArtifactIds,
    };
    // Each department starts with its OWN duplicated placeholder, not a
    // value shared across departments. Sharing one literal string across
    // all four (as an earlier version of this fixture did) meant every
    // department's "already exists elsewhere" avoid check
    // (normalizeCanonicalNarrativeV3ForPublication's avoidTextsFor) would
    // trip on the *other* three departments' identical placeholder text —
    // an artifact of the fixture, not a real duplicate-across-departments
    // scenario. Real archived duplicates never shared text across
    // departments this way; only within one department's own two fields.
    const initialTextFor = (departmentId: string) =>
      `${departmentId} pre-normalization placeholder (discarded by reconstruction).`;
    const canonical = ChairSynthesisV3ModelOutputSchema.parse({
      kind: "chair_synthesis_v3",
      sourceLocale: "en",
      stance: "balanced",
      decisiveReason: first.text.en,
      strongestCountercase: first.text.en,
      invalidationCheckpoint: first.text.en,
      decisionLineage: {
        decisiveReason: foreign,
        strongestCountercase: foreign,
        invalidationCheckpoint: foreign,
      },
      teamViews: departments.map((departmentId) => ({
        departmentId,
        position: initialTextFor(departmentId),
        rationale: initialTextFor(departmentId),
        vote: "support_with_reservations",
        lineage: foreign,
      })),
      sections: sectionKeys.map((sectionKey) => ({
        sectionKey,
        narrative: first.text.en,
        lineage: foreign,
      })),
      anticipatedQuestions: [],
    });
    const result = normalizeCanonicalNarrativeV3ForPublication({
      canonical,
      sentences,
      auditedClaimIds: [
        ...new Set(sentences.flatMap((sentence) => sentence.claimIds)),
      ],
      sourceArtifactIds: [
        ...new Set(sentences.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
      sections: sectionKeys.map((sectionKey) => ({
        sectionKey,
        primarySentenceId: "position:market",
      })),
    });
    for (const view of result.canonical.teamViews) {
      expect(view.position).toBe(
        `${view.departmentId} position evidence supports the investment conclusion.`,
      );
      expect(view.rationale).toBe(
        `${view.departmentId} ballot evidence supports the investment conclusion.`,
      );
      expect(view.lineage.sentenceIds).toEqual([
        `position:${view.departmentId}`,
        `ballot:${view.departmentId}`,
      ]);
    }
    expect(result.reduced).toBe(true);
  });

  function sharedClaimFixture() {
    const claimA = "00000000-0000-4000-8000-0000000000a1";
    const marketOnlyClaim = "00000000-0000-4000-8000-0000000000a2";
    const companyOnlyClaim = "00000000-0000-4000-8000-0000000000a3";
    const artifactShared = "00000000-0000-4000-8000-0000000000b1";
    const artifactMarketBallot = "00000000-0000-4000-8000-0000000000b2";
    const artifactCompanyBallot = "00000000-0000-4000-8000-0000000000b3";
    const artifactFinancial = "00000000-0000-4000-8000-0000000000b4";
    const artifactRisk = "00000000-0000-4000-8000-0000000000b5";

    const sentences = [
      {
        sentenceId: "position:market",
        claimIds: [claimA],
        sourceArtifactIds: [artifactShared],
        text: {
          en: "Market position holds given the shared evidence.",
          ko: "market 포지션은 공유 근거에 기반해 유지됩니다.",
        },
      },
      {
        // Excluded from auditedClaimIds below, so this never grounds — the
        // department is forced past its own ballot toward the shared claim.
        sentenceId: "ballot:market",
        claimIds: [marketOnlyClaim],
        sourceArtifactIds: [artifactMarketBallot],
        text: {
          en: "Market ballot rationale is unaudited and must not ground.",
          ko: "market 표결 근거는 감사되지 않아 근거로 쓰일 수 없습니다.",
        },
      },
      {
        sentenceId: "position:company",
        claimIds: [claimA],
        sourceArtifactIds: [artifactShared],
        text: {
          en: "Company position holds given the shared evidence.",
          ko: "company 포지션은 공유 근거에 기반해 유지됩니다.",
        },
      },
      {
        // Same exclusion as ballot:market, for the same reason.
        sentenceId: "ballot:company",
        claimIds: [companyOnlyClaim],
        sourceArtifactIds: [artifactCompanyBallot],
        text: {
          en: "Company ballot rationale is unaudited and must not ground.",
          ko: "company 표결 근거는 감사되지 않아 근거로 쓰일 수 없습니다.",
        },
      },
      {
        // The only remaining grounded, distinct-from-position candidate for
        // BOTH market and company once their own ballots are excluded.
        sentenceId: `claim:${claimA}`,
        claimIds: [claimA],
        sourceArtifactIds: [artifactShared],
        text: {
          en: "Shared claim evidence supports the market and company view.",
          ko: "공유된 근거는 market과 company의 판단을 함께 지지합니다.",
        },
      },
      {
        sentenceId: "position:financial",
        claimIds: [claimA],
        sourceArtifactIds: [artifactFinancial],
        text: {
          en: "Financial position holds on its own evidence.",
          ko: "financial 포지션은 자체 근거로 유지됩니다.",
        },
      },
      {
        sentenceId: "ballot:financial",
        claimIds: [claimA],
        sourceArtifactIds: [artifactFinancial],
        text: {
          en: "Financial ballot rationale stands on its own evidence.",
          ko: "financial 표결 근거는 자체 근거로 성립합니다.",
        },
      },
      {
        sentenceId: "position:risk",
        claimIds: [claimA],
        sourceArtifactIds: [artifactRisk],
        text: {
          en: "Risk position holds on its own evidence.",
          ko: "risk 포지션은 자체 근거로 유지됩니다.",
        },
      },
      {
        sentenceId: "ballot:risk",
        claimIds: [claimA],
        sourceArtifactIds: [artifactRisk],
        text: {
          en: "Risk ballot rationale stands on its own evidence.",
          ko: "risk 표결 근거는 자체 근거로 성립합니다.",
        },
      },
    ];
    const foreign = {
      sentenceIds: ["position:market"],
      claimIds: [claimA],
      sourceArtifactIds: [artifactShared],
    };
    const financialLineage = {
      sentenceIds: ["position:financial", "ballot:financial"],
      claimIds: [claimA],
      sourceArtifactIds: [artifactFinancial],
    };
    const riskLineage = {
      sentenceIds: ["position:risk", "ballot:risk"],
      claimIds: [claimA],
      sourceArtifactIds: [artifactRisk],
    };
    // Each department's pre-normalization placeholder is distinct — not
    // shared with the OTHER department's placeholder or with any real
    // catalog sentence text. Reusing one literal string across both (an
    // earlier version of this fixture did, via sentences[0]) would trip
    // normalizeCanonicalNarrativeV3ForPublication's avoidTextsFor check on
    // itself: "company's pre-existing text" would coincidentally equal
    // "market's real position sentence text", blocking market from
    // legitimately claiming its own position sentence. Real archived
    // duplicates never shared text across departments this way.
    const teamViewFor = (departmentId: "market" | "company") => ({
      departmentId,
      position: `${departmentId} pre-normalization placeholder.`,
      rationale: `${departmentId} pre-normalization placeholder.`,
      vote: "support_with_reservations" as const,
      lineage: foreign,
    });
    // `order` controls only the input array position of market vs company —
    // never which one is *processed* first for shared-candidate purposes
    // (MAJOR 3: that is fixed by canonical department order, not array
    // order).
    const buildResult = (order: readonly ["market", "company"] | readonly ["company", "market"]) => {
      const canonical = ChairSynthesisV3ModelOutputSchema.parse({
        kind: "chair_synthesis_v3",
        sourceLocale: "en",
        stance: "balanced",
        decisiveReason: sentences[0]?.text.en,
        strongestCountercase: sentences[0]?.text.en,
        invalidationCheckpoint: sentences[0]?.text.en,
        decisionLineage: {
          decisiveReason: foreign,
          strongestCountercase: foreign,
          invalidationCheckpoint: foreign,
        },
        teamViews: [
          ...order.map((departmentId) => teamViewFor(departmentId)),
          {
            departmentId: "financial",
            position: "Financial position holds on its own evidence.",
            rationale:
              "Financial ballot rationale stands on its own evidence.",
            vote: "support_with_reservations",
            lineage: financialLineage,
          },
          {
            departmentId: "risk",
            position: "Risk position holds on its own evidence.",
            rationale: "Risk ballot rationale stands on its own evidence.",
            vote: "support_with_reservations",
            lineage: riskLineage,
          },
        ],
        sections: sectionKeys.map((sectionKey) => ({
          sectionKey,
          narrative: sentences[0]?.text.en,
          lineage: foreign,
        })),
        anticipatedQuestions: [],
      });
      return normalizeCanonicalNarrativeV3ForPublication({
        canonical,
        sentences,
        auditedClaimIds: [claimA],
        sourceArtifactIds: [
          artifactShared,
          artifactMarketBallot,
          artifactCompanyBallot,
          artifactFinancial,
          artifactRisk,
        ],
        sections: sectionKeys.map((sectionKey) => ({
          sectionKey,
          primarySentenceId: "position:market",
        })),
      });
    };
    const normalizeInput = () => ({
      sentences,
      auditedClaimIds: [claimA],
      sourceArtifactIds: [
        artifactShared,
        artifactMarketBallot,
        artifactCompanyBallot,
        artifactFinancial,
        artifactRisk,
      ],
      sections: sectionKeys.map((sectionKey) => ({
        sectionKey,
        primarySentenceId: "position:market",
      })),
    });
    return { buildResult, normalizeInput };
  }

  it("never reuses a shared claim sentence across two departments' recovered team views", () => {
    // Injected scenario (not real archived data): market's and company's own
    // ballot sentences are deliberately excluded from the audited claim set
    // so both departments fall back to a claim they both cite. Before the
    // fix, the second department to be normalized could be handed the exact
    // same sentence the first already used — reproducing the archived
    // cross-index duplicates (GOOG tv[0]==tv[1], SKHY tv[1]==tv[2]) via
    // injection, since the originals are no longer reproducible from stored
    // data (see report).
    const { buildResult } = sharedClaimFixture();
    const result = buildResult(["market", "company"]);
    const market = result.canonical.teamViews.find(
      (view) => view.departmentId === "market",
    );
    const company = result.canonical.teamViews.find(
      (view) => view.departmentId === "company",
    );
    expect(market).toBeDefined();
    expect(company).toBeDefined();
    if (market === undefined || company === undefined) return;
    // market recovers the shared claim honestly — it is the only distinct,
    // grounded candidate left once its own ballot is excluded.
    expect(market.rationale).toBe(
      "Shared claim evidence supports the market and company view.",
    );
    // company must NOT be handed that same sentence a second time. Either it
    // recovers a distinct one, or (as here, since none remains) it is left
    // unchanged rather than silently duplicating market's rationale.
    expect(company.rationale.trim()).not.toBe(market.rationale.trim());
    expect(company.position.trim()).not.toBe(market.rationale.trim());
  });

  it("edge case: the shared-candidate winner does not depend on input array order", () => {
    // Same fixture as above, but company appears BEFORE market in the
    // model's own teamViews array. Before MAJOR 3's fix, whichever
    // department was processed first (= array order) won the shared
    // sentence — so this permutation would have made company win instead
    // of market, an order-dependent outcome for a supposedly deterministic
    // publication step.
    const { buildResult } = sharedClaimFixture();
    const reordered = buildResult(["company", "market"]);
    const market = reordered.canonical.teamViews.find(
      (view) => view.departmentId === "market",
    );
    const company = reordered.canonical.teamViews.find(
      (view) => view.departmentId === "company",
    );
    expect(market).toBeDefined();
    expect(company).toBeDefined();
    if (market === undefined || company === undefined) return;
    // Same winner as the non-reordered case above: market, because
    // department processing order is fixed (WORKFLOW_V1_DEPARTMENT_IDS),
    // not the input array's order.
    expect(market.rationale).toBe(
      "Shared claim evidence supports the market and company view.",
    );
    expect(company.rationale.trim()).not.toBe(market.rationale.trim());
  });

  it("edge case: renormalizing an already-normalized result never regresses a fixed view or creates a new cross-view collision", () => {
    // Repeated normalization, feeding normalize's own output back into
    // itself with the exact same evidence catalog it saw the first time.
    //
    // This is NOT a claim that the output is byte-for-byte stable across
    // passes, and it is not a claim that every view converges to distinct
    // eventually: company in this fixture has no honest distinct candidate
    // on pass 1 (its own ballot sentence is excluded from the audited claim
    // set) and none appears on pass 2 either — its pre-existing internal
    // duplicate is left alone on both passes, exactly as the very first
    // test above documents. What this test guards is narrower but is what
    // actually matters operationally: a view MAJOR 3's fix already made
    // distinct (market, via the shared claim) must not regress on a second
    // pass, and no NEW cross-view collision may appear either — because
    // normalize's narrower per-pass reservation (only newly-assigned
    // sentences, not passthrough ones) means a later pass could in
    // principle free up a sentence a passthrough view is still relying on.
    const { buildResult, normalizeInput } = sharedClaimFixture();
    const first = buildResult(["market", "company"]);
    const firstMarket = first.canonical.teamViews.find(
      (view) => view.departmentId === "market",
    );
    expect(firstMarket).toBeDefined();
    if (firstMarket === undefined) return;
    expect(firstMarket.rationale.trim()).not.toBe(
      firstMarket.position.trim(),
    );
    const second = normalizeCanonicalNarrativeV3ForPublication({
      canonical: first.canonical,
      ...normalizeInput(),
    });
    const secondMarket = second.canonical.teamViews.find(
      (view) => view.departmentId === "market",
    );
    expect(secondMarket).toBeDefined();
    if (secondMarket === undefined) return;
    expect(
      secondMarket.rationale.trim(),
      "market must not regress to a duplicate on the second pass",
    ).not.toBe(secondMarket.position.trim());
    expect(
      secondMarket.position.trim(),
      "market's position must not shift between passes",
    ).toBe(firstMarket.position.trim());
    // The direct check (review report, "채택 2"): company's pass-2
    // rationale must not become market's pass-2 rationale. A weaker
    // "at most one duplicate text in the whole set" tally does not catch
    // this specific regression, because company already contributes one
    // legitimate (pre-existing, never-fixable) self-duplicate to that
    // tally on every pass — a second, DIFFERENT collision (company
    // stealing market's settled rationale) would not raise the count past
    // what pass 1 already had, and would slip through undetected.
    const secondCompany = second.canonical.teamViews.find(
      (view) => view.departmentId === "company",
    );
    expect(secondCompany).toBeDefined();
    if (secondCompany === undefined) return;
    expect(
      secondCompany.rationale.trim(),
      "company must not take over market's already-settled rationale on the second pass",
    ).not.toBe(secondMarket.rationale.trim());
    expect(
      secondCompany.position.trim(),
      "company must not take over market's already-settled position on the second pass either",
    ).not.toBe(secondMarket.position.trim());
  });
});
