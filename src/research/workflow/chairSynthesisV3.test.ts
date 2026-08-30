import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { createSqliteChairSynthesis } from "./chairSynthesis";
import { createPreparedChairRound } from "./chairSynthesis.testSupport";
import {
  ChairSynthesisV3ModelOutputSchema,
  chairSynthesisV3Prompt,
} from "./chairSynthesisContracts";
import { synthesizeChairV3 } from "./chairSynthesisV3";

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

  it("degrades repeated generic posture locally", async () => {
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
      expect(
        publishedCore.match(/wait|conditional|confirmation/giu) ?? [],
      ).toHaveLength(0);
    } finally {
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
