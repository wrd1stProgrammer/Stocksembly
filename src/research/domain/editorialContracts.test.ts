import { describe, expect, it } from "vitest";
import {
  AtomicEditorialClaimSchema,
  ComparatorSchema,
  PersistedQuestionAnswerSchema,
  TeamEditorialDecisionSchema,
  WorkflowV2EditorialOutputSchema,
} from "./agentOutputs";
import {
  deriveEditorialConfidence,
  EDITORIAL_SIMILARITY_THRESHOLDS,
  evaluateEditorialQuality,
  isSimilarityThresholdViolation,
  normalizeEditorialText,
  scoreSetDice,
  scoreSetJaccard,
  textSimilarity,
} from "./editorialQuality";

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const claim = {
  claimId: id(1),
  decisionDimension: "margin",
  roleOwner: "financial_quality",
  stanceContribution: "supports",
  materiality: "material",
  publicThesis: {
    en: "Cash conversion supports durable margins.",
    ko: "현금 전환은 지속 가능한 마진을 뒷받침합니다.",
  },
  evidenceArtifactIds: [id(2)],
  counterevidenceArtifactIds: [id(3)],
  decisiveMetricIds: [id(4), id(5), id(6)],
  falsifier: {
    en: "Two quarters of falling cash conversion would falsify this claim.",
    ko: "현금 전환율이 두 분기 연속 하락하면 이 주장은 기각됩니다.",
  },
} as const;

describe("workflow-v2 editorial contracts", () => {
  it("parses atomic claims, directional decisions, typed comparators, and persisted Q&A", () => {
    const decision = {
      stance: "upside_skewed",
      confidence: "high",
      decisiveReason: {
        en: "Cash conversion and margin evidence align.",
        ko: "현금 전환과 마진 근거가 일치합니다.",
      },
      strongestCountercase: {
        en: "Demand could weaken before operating leverage appears.",
        ko: "영업 레버리지 전에 수요가 약화될 수 있습니다.",
      },
      falsifier: claim.falsifier,
      primaryClaimIds: [claim.claimId],
    } as const;
    const comparator = {
      comparatorId: "peer-a",
      role: "direct_competitor",
      rationale: {
        en: "Overlapping enterprise buyers and products.",
        ko: "기업 고객과 제품군이 겹칩니다.",
      },
      comparableMetricKeys: ["revenue_growth", "operating_margin"],
    } as const;
    const qa = {
      questionId: id(7),
      decisionKey: "margin_durability",
      question: {
        en: "What breaks the thesis?",
        ko: "무엇이 논지를 깨뜨리나요?",
      },
      answer: claim.falsifier,
      primaryClaimIds: [claim.claimId],
      evidenceArtifactIds: [id(2)],
      rank: 1,
    } as const;

    expect(
      AtomicEditorialClaimSchema.parse(claim).decisiveMetricIds,
    ).toHaveLength(3);
    expect(TeamEditorialDecisionSchema.parse(decision).stance).toBe(
      "upside_skewed",
    );
    expect(ComparatorSchema.parse(comparator).role).toBe("direct_competitor");
    expect(PersistedQuestionAnswerSchema.parse(qa).decisionKey).toBe(
      "margin_durability",
    );
    expect(
      WorkflowV2EditorialOutputSchema.parse({
        schemaVersion: "workflow-v2",
        claims: [claim],
        decision,
        comparators: [comparator],
        anticipatedQuestions: [qa],
      }).schemaVersion,
    ).toBe("workflow-v2");
  });

  it("rejects malformed stance, untyped comparator, and a missing role owner", () => {
    expect(
      AtomicEditorialClaimSchema.safeParse({ ...claim, roleOwner: undefined })
        .success,
    ).toBe(false);
    expect(
      TeamEditorialDecisionSchema.safeParse({
        stance: "balanced",
        confidence: "high",
        decisiveReason: claim.publicThesis,
        strongestCountercase: claim.falsifier,
        falsifier: claim.falsifier,
        primaryClaimIds: [claim.claimId],
      }).success,
    ).toBe(false);
    expect(
      ComparatorSchema.safeParse({
        comparatorId: "peer-a",
        rationale: claim.publicThesis,
        comparableMetricKeys: ["margin"],
      }).success,
    ).toBe(false);
    expect(
      WorkflowV2EditorialOutputSchema.safeParse({
        schemaVersion: "workflow-v2",
        claims: [claim, claim],
        decision: {
          stance: "wait_for_proof",
          confidence: "low",
          decisiveReason: claim.publicThesis,
          strongestCountercase: claim.falsifier,
          falsifier: claim.falsifier,
          primaryClaimIds: [claim.claimId],
        },
        comparators: [],
        anticipatedQuestions: [],
      }).success,
    ).toBe(false);
  });
});

describe("deterministic editorial quality", () => {
  it("normalizes without losing numbers and applies exact bilingual thresholds", () => {
    expect(EDITORIAL_SIMILARITY_THRESHOLDS).toEqual({
      enContentWordJaccard: 0.68,
      enCharTrigramDice: 0.78,
      koWordBigramJaccard: 0.6,
      koNoSpaceCharTrigramDice: 0.72,
    });
    expect(normalizeEditorialText("  ＡBC, [1] 12.5%!! ")).toBe("abc 12 5");
    expect(
      textSimilarity(
        "Revenue growth remains durable because enterprise demand supports margins",
        "Enterprise demand supports durable revenue growth and margins",
        "en",
      ).duplicate,
    ).toBe(true);
    expect(
      textSimilarity(
        "수요 회복으로 매출 성장과 영업 마진 개선이 이어집니다",
        "수요 회복으로 매출 성장과 영업 마진 개선이 지속됩니다",
        "ko",
      ).duplicate,
    ).toBe(true);
    expect(
      textSimilarity(
        "Revenue growth accelerates with enterprise adoption",
        "Regulatory penalties could constrain overseas distribution",
        "en",
      ).duplicate,
    ).toBe(false);
  });

  it("executes exact reject and just-below allow probes for all four similarity thresholds", () => {
    const set = (prefix: string, count: number) =>
      new Set(Array.from({ length: count }, (_, index) => `${prefix}${index}`));
    const withCommon = (commonCount: number, uniqueCount: number) => {
      const common = set("c", commonCount);
      return [
        new Set([...common, ...set("l", uniqueCount)]),
        new Set([...common, ...set("r", uniqueCount)]),
      ] as const;
    };

    const enJaccardAt = scoreSetJaccard(...withCommon(17, 4));
    const enJaccardBelow = scoreSetJaccard(...withCommon(16, 4));
    const enDiceAt = scoreSetDice(...withCommon(39, 11));
    const enDiceBelow = scoreSetDice(...withCommon(38, 12));
    const koJaccardAt = scoreSetJaccard(...withCommon(3, 1));
    const koJaccardBelow = scoreSetJaccard(...withCommon(2, 1));
    const koDiceAt = scoreSetDice(...withCommon(18, 7));
    const koDiceBelow = scoreSetDice(...withCommon(17, 8));

    expect(enJaccardAt).toBe(0.68);
    expect(
      isSimilarityThresholdViolation("en_content_word_jaccard", enJaccardAt),
    ).toBe(true);
    expect(enJaccardBelow).toBeLessThan(0.68);
    expect(
      isSimilarityThresholdViolation("en_content_word_jaccard", enJaccardBelow),
    ).toBe(false);
    expect(enDiceAt).toBe(0.78);
    expect(
      isSimilarityThresholdViolation("en_char_trigram_dice", enDiceAt),
    ).toBe(true);
    expect(enDiceBelow).toBeLessThan(0.78);
    expect(
      isSimilarityThresholdViolation("en_char_trigram_dice", enDiceBelow),
    ).toBe(false);
    expect(koJaccardAt).toBe(0.6);
    expect(
      isSimilarityThresholdViolation("ko_word_bigram_jaccard", koJaccardAt),
    ).toBe(true);
    expect(koJaccardBelow).toBeLessThan(0.6);
    expect(
      isSimilarityThresholdViolation("ko_word_bigram_jaccard", koJaccardBelow),
    ).toBe(false);
    expect(koDiceAt).toBe(0.72);
    expect(
      isSimilarityThresholdViolation("ko_no_space_char_trigram_dice", koDiceAt),
    ).toBe(true);
    expect(koDiceBelow).toBeLessThan(0.72);
    expect(
      isSimilarityThresholdViolation(
        "ko_no_space_char_trigram_dice",
        koDiceBelow,
      ),
    ).toBe(false);
  });

  it("keeps bilingual prose golden reject and allowed pairs distinct", () => {
    expect(
      textSimilarity(
        "Enterprise demand supports durable revenue growth and margins",
        "Durable revenue growth and margins are supported by enterprise demand",
        "en",
      ).duplicate,
    ).toBe(true);
    expect(
      textSimilarity(
        "Enterprise adoption is accelerating revenue growth",
        "Regulatory penalties may constrain overseas distribution",
        "en",
      ).duplicate,
    ).toBe(false);
    expect(
      textSimilarity(
        "수요 회복으로 매출 성장과 영업 마진 개선이 이어집니다",
        "수요 회복으로 매출 성장과 영업 마진 개선이 지속됩니다",
        "ko",
      ).duplicate,
    ).toBe(true);
    expect(
      textSimilarity(
        "기업 수요 회복이 매출 성장과 마진을 지지합니다",
        "규제 강화는 해외 유통과 제품 승인을 지연시킬 수 있습니다",
        "ko",
      ).duplicate,
    ).toBe(false);
  });

  it("rejects position prose cloned into a section with stable field paths", () => {
    const result = evaluateEditorialQuality({
      locale: "en",
      position: "Cash conversion supports durable margins.",
      rationale: "Operating discipline improved through the filing period.",
      supportedNumbers: [],
      sections: [
        {
          sectionKey: "decision",
          claimIds: [id(1)],
          text: "Cash conversion supports durable margins.",
        },
      ],
      comparators: [],
      anticipatedQuestions: [],
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("public_field_overlap");
    expect(result.issues).toContainEqual({
      reason: "exact_duplicate",
      leftPath: "position",
      rightPath: "sections[0].text",
    });
  });

  it("returns stable reason codes for leakage, unsupported numbers, ownership, comparators, and overlap", () => {
    const result = evaluateEditorialQuality({
      locale: "en",
      position: "Margins improve 37% as adoption expands.",
      rationale: "Margins improve 37% as adoption expands.",
      supportedNumbers: ["12"],
      sections: [
        {
          sectionKey: "decision",
          claimIds: [id(1)],
          text: "Margins improve 37%.",
        },
        {
          sectionKey: "analysis",
          claimIds: [id(1)],
          text: "Margins improve 37%.",
        },
      ],
      comparators: [{ comparatorId: "peer-a" }],
      anticipatedQuestions: [
        {
          decisionKey: "a",
          answer: "We can browse the provided data and use tools.",
        },
        {
          decisionKey: "b",
          answer: "We can browse provided data using tools.",
        },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "exact_duplicate",
        "position_equals_rationale",
        "unsupported_number",
        "section_ownership_conflict",
        "untyped_comparator",
        "capability_leakage",
        "qa_overlap",
      ]),
    );
    expect(
      evaluateEditorialQuality({
        locale: "en",
        position: "The filing supports margin durability.",
        rationale:
          "Cash conversion improved while reinvestment stayed disciplined.",
        supportedNumbers: [],
        sections: [
          {
            sectionKey: "decision",
            claimIds: [id(1)],
            text: "Margin durability is supported.",
          },
        ],
        comparators: [],
        anticipatedQuestions: [],
      }),
    ).toEqual({
      passed: true,
      reasons: [],
      issues: [],
      metrics: expect.any(Object),
    });
  });

  it("flags forbidden public vocabulary and dense supported number dumps separately", () => {
    const result = evaluateEditorialQuality({
      locale: "en",
      position: "Guaranteed return 10 20 30 40",
      rationale: "The filing does not justify a personalized instruction.",
      supportedNumbers: ["10", "20", "30", "40"],
      sections: [],
      comparators: [],
      anticipatedQuestions: [],
    });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "forbidden_public_vocabulary",
        "numeric_density",
      ]),
    );
    expect(result.reasons).not.toContain("unsupported_number");
  });

  it("does not classify a direct trade conclusion as forbidden vocabulary", () => {
    const result = evaluateEditorialQuality({
      locale: "en",
      position: "Buy now because demand evidence supports expansion.",
      rationale:
        "Cash conversion improved while reinvestment stayed disciplined.",
      supportedNumbers: [],
      sections: [],
      comparators: [],
      anticipatedQuestions: [],
    });

    expect(result.reasons).not.toContain("forbidden_public_vocabulary");
  });

  it("derives confidence from evidence facts and never rewrite prose", () => {
    const highFacts = {
      thesisMateriality: "material",
      semanticVerdict: "entailed",
      independentSourceClasses: ["official_filing", "exchange_data"],
      authoritativeSourceClasses: ["official_filing"],
      criticalDataFreshness: "current",
      contradictionSeverity: "none",
    } as const;
    expect(deriveEditorialConfidence(highFacts)).toBe("high");
    expect(
      deriveEditorialConfidence({ ...highFacts, rewriteProse: "weak wording" }),
    ).toBe("high");
    expect(
      deriveEditorialConfidence({
        ...highFacts,
        independentSourceClasses: ["official_filing"],
      }),
    ).toBe("medium");
    expect(
      deriveEditorialConfidence({
        ...highFacts,
        contradictionSeverity: "severe",
      }),
    ).toBe("low");
  });
});
