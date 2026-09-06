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
  normalizeCanonicalNarrativeV3ForPublication,
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
    rationale: narrative,
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
        position: first.text.en,
        rationale: first.text.en,
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
});
