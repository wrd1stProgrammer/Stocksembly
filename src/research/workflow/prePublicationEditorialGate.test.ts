import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AtomicEditorialClaimSchema,
  TeamEditorialDecisionSchema,
} from "../domain/agentOutputsShared";
import {
  containsCapabilityLeakage,
  containsForbiddenPublicVocabulary,
  sanitizePublicEditorialText,
} from "../domain/editorialQuality";
import { TickerSymbolSchema } from "../domain/ids";
import { selectGroundedAnticipatedQuestions } from "./anticipatedQuestionsPublication";
import {
  deterministicMetadataRewrite,
  evaluatePrePublicationEditorialGate,
  gateWithOneTargetedRewrite,
  type PrePublicationEditorialCandidate,
} from "./prePublicationEditorialGate";

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const fixture = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "src/research/testFixtures/spcx-editorial-quality-candidate.json",
    ),
    "utf8",
  ),
) as PrePublicationEditorialCandidate;

function cleanCandidate(): PrePublicationEditorialCandidate {
  return {
    ...fixture,
    position: {
      en: "Demand evidence favors durable expansion.",
      ko: "수요 근거는 지속 가능한 확장 논지를 지지합니다.",
    },
    rationale: {
      en: "Cash conversion confirms operating discipline.",
      ko: "현금 전환은 운영 규율을 확인합니다.",
    },
    sections: [
      {
        sectionKey: "supported_analysis",
        text: {
          en: "Enterprise adoption broadened across customer cohorts.",
          ko: "기업 도입은 고객군 전반으로 확대됐습니다.",
        },
        claimIds: [id(1)],
        checkpoint: {
          en: "Adoption remains broad.",
          ko: "도입 범위가 넓게 유지됩니다.",
        },
      },
      {
        sectionKey: "valuation_comparison",
        text: {
          en: "The proxy shares normalized revenue growth and margin periods.",
          ko: "해당 대용 기업은 정규화된 매출 성장과 마진 기간을 공유합니다.",
        },
        claimIds: [id(3)],
        checkpoint: {
          en: "Period alignment remains valid.",
          ko: "기간 정렬이 유효하게 유지됩니다.",
        },
      },
    ],
    comparators: [
      {
        comparatorId: "peer",
        role: "valuation_proxy",
        rationale: {
          en: "The same period and normalized revenue metric are available.",
          ko: "동일 기간의 정규화된 매출 지표를 사용할 수 있습니다.",
        },
        comparableMetricKeys: ["revenue_growth"],
      },
    ],
    anticipatedQuestions: [
      {
        ...fixture.anticipatedQuestions[0]!,
        decisionKey: "dominant_growth",
        answer: {
          en: "Enterprise adoption is the decisive growth evidence.",
          ko: "기업 도입이 성장 판단의 결정적 근거입니다.",
        },
        primaryClaimIds: [id(1)],
        evidenceArtifactIds: [id(2)],
      },
      {
        ...fixture.anticipatedQuestions[1]!,
        decisionKey: "valuation_reset",
        answer: {
          en: "Period misalignment would invalidate the valuation proxy.",
          ko: "기간 불일치는 밸류에이션 대용 비교를 무효화합니다.",
        },
        primaryClaimIds: [id(3)],
        evidenceArtifactIds: [id(4)],
      },
    ],
    permittedClaimIds: [id(1), id(3)],
    permittedEvidenceArtifactIds: [id(2), id(4)],
  };
}

describe("pre-publication editorial quality gate", () => {
  it("validates the selected model language alongside deterministic bilingual fields", () => {
    const candidate = cleanCandidate();
    const englishBoundaryCandidate: PrePublicationEditorialCandidate = {
      ...candidate,
      position: { en: candidate.position.en, ko: candidate.position.en },
      rationale: { en: candidate.rationale.en, ko: candidate.rationale.en },
      sections: candidate.sections.map((section) => ({
        ...section,
        text: { en: section.text.en, ko: section.text.en },
      })),
    };

    expect(
      evaluatePrePublicationEditorialGate(englishBoundaryCandidate)
        .publishable,
    ).toBe(true);
  });

  it("rejects the sanitized SPCX-like candidate with exact field paths", () => {
    const result = evaluatePrePublicationEditorialGate(fixture);
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "position_equals_rationale",
          path: "rationale.en",
        }),
        expect.objectContaining({
          code: "section_ownership_conflict",
          path: "sections[1].claimIds",
        }),
        expect.objectContaining({
          code: "checkpoint_ownership_conflict",
          path: "sections[1].checkpoint.en",
        }),
        expect.objectContaining({
          code: "capability_leakage",
          path: "sections[1].text.en",
        }),
        expect.objectContaining({
          code: "unsupported_number",
          path: "sections[1].text.en",
        }),
        expect.objectContaining({
          code: "qa_decision_key_conflict",
          path: "anticipatedQuestions[1].decisionKey",
        }),
        expect.objectContaining({
          code: "qa_primary_claim_limit",
          path: "anticipatedQuestions[2].primaryClaimIds",
        }),
      ]),
    );
  });

  it("does not invoke a fake publication rewrite for a soft prose issue", async () => {
    const repaired = cleanCandidate();
    const invalid: PrePublicationEditorialCandidate = {
      ...repaired,
      sections: repaired.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              text: { ...section.text, en: repaired.sections[0]!.text.en },
            }
          : section,
      ),
    };
    let captured: unknown;
    const rewrite = vi.fn(async (request) => {
      captured = request;
      return repaired;
    });
    const result = await gateWithOneTargetedRewrite(invalid, rewrite);
    expect(rewrite).not.toHaveBeenCalled();
    expect(captured).toBeUndefined();
    expect(result).toMatchObject({
      kind: "accepted",
      rewritten: false,
      candidate: { confidence: "medium" },
    });
  });

  it("allows a grounded Q&A to restate its linked section without synthetic filler", async () => {
    const clean = cleanCandidate();
    const invalid: PrePublicationEditorialCandidate = {
      ...clean,
      anticipatedQuestions: clean.anticipatedQuestions.map((question, index) =>
        index === 0
          ? {
              ...question,
              answer: { ...question.answer, en: clean.sections[0]!.text.en },
            }
          : question,
      ),
    };

    await expect(
      gateWithOneTargetedRewrite(invalid, async (request) =>
        deterministicMetadataRewrite(invalid, request),
      ),
    ).resolves.toMatchObject({ kind: "accepted", rewritten: false });
  });

  it("allows a grounded falsifier Q&A to restate a later section after claim ownership was assigned earlier", async () => {
    const clean = cleanCandidate();
    const invalid: PrePublicationEditorialCandidate = {
      ...clean,
      sections: clean.sections.map((section, index) =>
        index === 1 ? { ...section, claimIds: [] } : section,
      ),
      anticipatedQuestions: clean.anticipatedQuestions.map((question, index) =>
        index === 0
          ? {
              ...question,
              answer: {
                ...question.answer,
                en: clean.sections[1]!.text.en,
              },
            }
          : question,
      ),
    };

    await expect(
      gateWithOneTargetedRewrite(invalid, async (request) =>
        deterministicMetadataRewrite(invalid, request),
      ),
    ).resolves.toMatchObject({ kind: "accepted", rewritten: false });
  });

  it("recovers from a rewrite that adds an unsupported metric", async () => {
    const repaired = cleanCandidate();
    const invalid: PrePublicationEditorialCandidate = {
      ...repaired,
      sections: repaired.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              text: { ...section.text, en: "Enterprise adoption reached 98%." },
            }
          : section,
      ),
    };
    const result = await gateWithOneTargetedRewrite(invalid, async () => ({
      ...repaired,
      sections: repaired.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              text: { ...section.text, en: "Enterprise adoption reached 99%." },
            }
          : section,
      ),
    }));
    expect(result).toMatchObject({ kind: "accepted", rewritten: true });
    if (result.kind === "accepted")
      expect(result.candidate.sections[1]?.text.en).not.toContain("99%");
  });

  it("ignores an out-of-scope sibling mutation and applies deterministic recovery", async () => {
    const original = cleanCandidate();
    const invalid: PrePublicationEditorialCandidate = {
      ...original,
      sections: original.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              text: { ...section.text, en: "Enterprise adoption reached 98%." },
            }
          : section,
      ),
    };
    const result = await gateWithOneTargetedRewrite(invalid, async () => ({
      ...original,
      sections: original.sections.map((section, index) =>
        index === 0
          ? { ...section, sectionKey: "silently_changed_section" }
          : index === 1
            ? {
                ...section,
                text: {
                  ...section.text,
                  en: "Enterprise adoption broadened across customer cohorts.",
                },
              }
            : section,
      ),
    }));

    expect(result).toMatchObject({ kind: "accepted", rewritten: true });
    if (result.kind === "accepted")
      expect(result.candidate.sections[0]?.sectionKey).toBe(
        original.sections[0]?.sectionKey,
      );
  });

  it.each([
    [
      "provided data",
      "The provided data supports expansion.",
      "capability_leakage",
      "sections[0].text.en",
    ],
    [
      "browsing tools",
      "Browsing lets us use tools for this conclusion.",
      "capability_leakage",
      "sections[0].text.en",
    ],
    [
      "Korean tool use",
      "도구를 사용해 확장을 확인했습니다.",
      "capability_leakage",
      "sections[0].text.ko",
    ],
    [
      "forbidden vocabulary",
      "Buy now for a guaranteed return.",
      "forbidden_public_vocabulary",
      "sections[0].text.en",
    ],
    [
      "numeric density",
      "Margin 10 20 30 40 improved.",
      "numeric_density",
      "sections[0].text.en",
    ],
    [
      "Korean provider particle",
      "제공업체의 제한(내부 사정) 때문에 확인 범위가 좁습니다.",
      "capability_leakage",
      "sections[0].text.ko",
    ],
    [
      "Korean data supplier",
      "데이터 공급자 제약으로 세부 자료를 확인하지 못했습니다.",
      "capability_leakage",
      "sections[0].text.ko",
    ],
    [
      "Korean licensing",
      "라이선싱 제한 때문에 원문을 공개할 수 없습니다.",
      "forbidden_public_vocabulary",
      "sections[0].text.ko",
    ],
    [
      "Korean internal schema",
      "내부 스키마상 이 항목은 표시되지 않습니다.",
      "capability_leakage",
      "sections[0].text.ko",
    ],
    [
      "Korean tool-use limitation",
      "도구 사용 제한으로 추가 검증을 진행하지 못했습니다.",
      "capability_leakage",
      "sections[0].text.ko",
    ],
    [
      "Korean provided evidence",
      "제공된 증거는 아직 점유율 침식을 보여주지 않습니다.",
      "forbidden_public_vocabulary",
      "sections[0].text.ko",
    ],
  ])(
    "rejects the shared %s quality reason at its field",
    (_label, text, code, path) => {
      const candidate = cleanCandidate();
      const locale = path.endsWith(".ko") ? "ko" : "en";
      const result = evaluatePrePublicationEditorialGate({
        ...candidate,
        supportedNumbers: ["10", "20", "30", "40"],
        sections: candidate.sections.map((section, index) =>
          index === 0
            ? { ...section, text: { ...section.text, [locale]: text } }
            : section,
        ),
      });
      expect(result.violations).toContainEqual(
        expect.objectContaining({ code, path }),
      );
    },
  );

  it("does not disguise weak prose with publication-boundary synonym replacement", async () => {
    const candidate = cleanCandidate();
    const raw =
      "제공된 증거와 데이터 공급자 제약을 고려하면 매출은 12.5% 증가했습니다.";
    const result = await gateWithOneTargetedRewrite(
      {
        ...candidate,
        supportedNumbers: ["12.5%"],
        sections: candidate.sections.map((section, index) =>
          index === 0
            ? { ...section, text: { ...section.text, ko: raw } }
            : section,
        ),
      },
      async (request) => deterministicMetadataRewrite(candidate, request),
    );

    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      const text = result.candidate.sections[0]!.text.ko;
      expect(text).toBe(raw);
      expect(text).toContain("12.5%");
      expect(containsForbiddenPublicVocabulary(text)).toBe(true);
      expect(containsCapabilityLeakage(text)).toBe(true);
    }
  });

  it("normalizes spacing without rewriting the chair's meaning", () => {
    const text = sanitizePublicEditorialText(
      "애플의  절대 주가 모멘텀은 약화됐지만, 제공된 증거만으로는 섹터 대비 성과를 확인할 수 없다.",
    );
    expect(text).toBe(
      "애플의 절대 주가 모멘텀은 약화됐지만, 제공된 증거만으로는 섹터 대비 성과를 확인할 수 없다.",
    );
    expect(containsForbiddenPublicVocabulary(text)).toBe(true);
  });

  it("removes workflow reassessment scaffolding from public prose", () => {
    expect(
      sanitizePublicEditorialText(
        "Reassess if official evidence no longer supports this claim: Azure growth must remain above 40%.",
      ),
    ).toBe("Azure growth must remain above 40%.");
    expect(
      sanitizePublicEditorialText(
        "공식 근거가 다음 주장을 더 이상 지지하지 않으면 재검토합니다: Azure 성장률은 40% 이상이어야 합니다.",
      ),
    ).toBe("Azure 성장률은 40% 이상이어야 합니다.");
  });

  it("rejects section keys and number-only section prose before publication", () => {
    const candidate = cleanCandidate();
    const result = evaluatePrePublicationEditorialGate({
      ...candidate,
      supportedNumbers: ["416161000000"],
      sections: candidate.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              text: { en: "supported_analysis", ko: "매출: 416161000000" },
            }
          : section,
      ),
    });
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "low_information_public_text",
          path: "sections[0].text.en",
        }),
        expect.objectContaining({
          code: "low_information_public_text",
          path: "sections[0].text.ko",
        }),
      ]),
    );
  });

  it("separates recoverable prose findings from factual publication blockers", () => {
    const candidate = cleanCandidate();
    const soft = evaluatePrePublicationEditorialGate({
      ...candidate,
      sections: candidate.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              text: {
                en: "Available evidence alone cannot determine adoption durability.",
                ko: "현재 근거만으로는 도입 지속성을 판단할 수 없습니다.",
              },
            }
          : section,
      ),
    });
    expect(soft.passed).toBe(false);
    expect(soft.publishable).toBe(true);
    expect(soft.softViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "generic_limitation_language" }),
      ]),
    );

    const hard = evaluatePrePublicationEditorialGate({
      ...candidate,
      sections: candidate.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              text: { ...section.text, en: "Adoption reached 99%." },
            }
          : section,
      ),
    });
    expect(hard.publishable).toBe(false);
    expect(hard.hardViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_number" }),
      ]),
    );
  });

  it("publishes supported Korean margin prose instead of treating years and quarters as a numeric dump", () => {
    const candidate = cleanCandidate();
    const result = evaluatePrePublicationEditorialGate({
      ...candidate,
      supportedNumbers: ["2025", "28.7%", "2026", "1", "35.0%"],
      sections: candidate.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              text: {
                ...section.text,
                ko: "코카콜라의 보고 영업이익률은 2025년 28.7%, 2026년 1분기 35.0%로 회복돼 수익모델의 회복력을 뒷받침한다.",
              },
            }
          : section,
      ),
    });

    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        code: "numeric_density",
        path: "sections[0].text.ko",
      }),
    );
  });

  it("exports narrow Korean internal-leakage probes without blocking legitimate investment prose", () => {
    expect(
      containsCapabilityLeakage(
        "데이터 제공업체 제한으로 범위가 축소됐습니다.",
      ),
    ).toBe(true);
    expect(
      containsCapabilityLeakage("제공업체의 제한(내부 사정)이 있습니다."),
    ).toBe(true);
    expect(
      containsCapabilityLeakage(
        "데이터 공급자 제약 때문에 확인하지 못했습니다.",
      ),
    ).toBe(true);
    expect(
      containsCapabilityLeakage("내부 스키마 및 도구 사용 제한이 원인입니다."),
    ).toBe(true);
    expect(
      containsForbiddenPublicVocabulary(
        "라이선스 제한·라이선싱 제약이 있습니다.",
      ),
    ).toBe(true);
    expect(
      containsForbiddenPublicVocabulary(
        "제공된 증거로는 결론을 내리기 어렵습니다.",
      ),
    ).toBe(true);

    expect(
      containsCapabilityLeakage("공급자 다변화는 원가 안정성을 높입니다."),
    ).toBe(false);
    expect(
      containsForbiddenPublicVocabulary(
        "소프트웨어 라이선스 매출이 성장했습니다.",
      ),
    ).toBe(false);
    expect(
      containsCapabilityLeakage("내부 통제와 데이터 스키마 개선이 필요합니다."),
    ).toBe(false);
  });

  it.each([
    ["invalid role", { role: "peer" }],
    ["empty metrics", { comparableMetricKeys: [] }],
    ["blank rationale", { rationale: { en: "", ko: "" } }],
    ["median ineligible", { medianEligibility: false }],
  ])("rejects an %s comparator at runtime", (_label, mutation) => {
    const candidate = cleanCandidate();
    const malformed = {
      ...candidate,
      comparators: [{ ...candidate.comparators[0]!, ...mutation }],
    } as unknown as PrePublicationEditorialCandidate;
    expect(
      evaluatePrePublicationEditorialGate(malformed).violations,
    ).toContainEqual(
      expect.objectContaining({
        code: "untyped_comparator",
        path: expect.stringMatching(/^comparators\[0\]\./u),
      }),
    );
  });
});

describe("persisted anticipated Q&A selection", () => {
  it("builds ten decision questions without pairing two templates per claim", () => {
    const theses = [
      [
        "Enterprise adoption broadens recurring demand.",
        "기업 도입이 반복 수요를 확대합니다.",
      ],
      [
        "Cash conversion confirms margin discipline.",
        "현금 전환이 마진 규율을 확인합니다.",
      ],
      [
        "Supply normalization improves delivery cadence.",
        "공급 정상화가 납품 주기를 개선합니다.",
      ],
      [
        "Retention data supports product durability.",
        "유지율 데이터가 제품 지속성을 지지합니다.",
      ],
      [
        "Backlog coverage anchors near-term visibility.",
        "수주잔고가 단기 가시성을 뒷받침합니다.",
      ],
      [
        "Balance-sheet capacity protects reinvestment.",
        "재무 여력이 재투자를 보호합니다.",
      ],
    ] as const;
    const falsifiers = [
      [
        "Renewal losses would negate adoption evidence.",
        "갱신 손실은 도입 근거를 무효화합니다.",
      ],
      [
        "Working-capital deterioration would break conversion.",
        "운전자본 악화는 현금 전환 논지를 깨뜨립니다.",
      ],
      [
        "Delivery delays would reverse supply progress.",
        "납품 지연은 공급 개선을 뒤집습니다.",
      ],
      [
        "Cohort churn would invalidate durability.",
        "고객군 이탈은 지속성을 무효화합니다.",
      ],
      [
        "Backlog cancellation would remove visibility.",
        "수주 취소는 가시성을 제거합니다.",
      ],
      [
        "Leverage expansion would constrain reinvestment.",
        "레버리지 확대는 재투자를 제약합니다.",
      ],
    ] as const;
    const claims = AtomicEditorialClaimSchema.array().parse(
      Array.from({ length: 6 }, (_, index) => ({
        claimId: id(index + 1),
        decisionDimension: "growth_engine" as const,
        roleOwner: "growth",
        stanceContribution: "supports" as const,
        materiality: "material" as const,
        publicThesis: { en: theses[index]![0], ko: theses[index]![1] },
        evidenceArtifactIds: [id(index + 20)],
        counterevidenceArtifactIds: [],
        decisiveMetricIds: [],
        falsifier: { en: falsifiers[index]![0], ko: falsifiers[index]![1] },
      })),
    );
    const decision = TeamEditorialDecisionSchema.parse({
      stance: "upside_skewed",
      confidence: "medium",
      decisiveReason: claims[0]!.publicThesis,
      strongestCountercase: claims[1]!.falsifier,
      falsifier: claims[0]!.falsifier,
      primaryClaimIds: [claims[0]!.claimId],
    });
    const selected = selectGroundedAnticipatedQuestions({
      runId: id(99),
      claims,
      decision,
    });
    expect(selected.questions).toHaveLength(10);
    expect(selected.policy.moduleMinimum).toBe(5);
    expect(
      Math.max(
        ...[
          ...new Set(selected.questions.flatMap((qa) => qa.primaryClaimIds)),
        ].map(
          (claimId) =>
            selected.questions.filter((qa) =>
              qa.primaryClaimIds.includes(claimId),
            ).length,
        ),
      ),
    ).toBe(2);
    expect(selected.questions[0]?.question.en).toBe(
      "What must be true before a new position has a favorable evidence-to-price trade-off?",
    );
    expect(
      new Set(selected.questions.map((question) => question.question.en)).size,
    ).toBeGreaterThan(1);
    expect(selected.questions[0]?.answer.en).toContain(
      "Enterprise adoption broadens recurring demand.",
    );
    expect(selected.questions[0]?.answer.en).toContain(
      "Working-capital deterioration would break conversion.",
    );
  });

  it("prioritizes earnings and grounded calculations without repeating the decision countercase", () => {
    const dimensions = [
      "embedded_expectations",
      "catalyst",
      "downside_path",
      "cash_conversion",
      "growth_engine",
    ] as const;
    const claims = AtomicEditorialClaimSchema.array().parse(
      dimensions.map((decisionDimension, index) => ({
        claimId: id(index + 41),
        decisionDimension,
        roleOwner: "growth",
        stanceContribution: index === 2 ? "opposes" : "supports",
        materiality: "material",
        publicThesis: {
          en: `Distinct evidence-backed thesis ${index + 1}.`,
          ko: `서로 다른 근거 기반 논지 ${index + 1}입니다.`,
        },
        evidenceArtifactIds: [id(index + 61)],
        counterevidenceArtifactIds: [],
        decisiveMetricIds:
          index === 0
            ? ["price_target_median"]
            : index === 4
              ? ["forward_eps"]
              : [],
        falsifier: {
          en: `Observable falsifier ${index + 1}.`,
          ko: `관찰 가능한 반증 조건 ${index + 1}입니다.`,
        },
      })),
    );
    const decision = TeamEditorialDecisionSchema.parse({
      stance: "wait_for_proof",
      confidence: "medium",
      decisiveReason: claims[0]!.publicThesis,
      strongestCountercase: claims[2]!.publicThesis,
      falsifier: claims[0]!.falsifier,
      primaryClaimIds: [claims[0]!.claimId],
    });

    const selected = selectGroundedAnticipatedQuestions({
      runId: id(98),
      claims,
      decision,
      researchProfile: {
        investmentHorizon: "short",
        counterargumentIntensity: "strong",
        analysisDepth: "deep",
        explanationMode: "professional",
        decisionPurpose: "earnings",
        comparisonSymbols: [TickerSymbolSchema.parse("MSFT")],
      },
      marketSnapshot: { lastPrice: 100 },
      metricSnapshot: {
        asOf: "2026-08-02T00:00:00.000Z",
        metrics: [
          {
            id: "price_target_median",
            label: {
              en: "Consensus price target",
              ko: "컨센서스 목표주가",
            },
            category: "expectations",
            value: 120,
            unit: "USD_per_share",
            observedAt: "2026-08-02T00:00:00.000Z",
            source: "insightsentry",
            signal: "higher_better",
          },
          {
            id: "forward_eps",
            label: { en: "Forward EPS", ko: "선행 EPS 전망" },
            category: "expectations",
            value: 5,
            unit: "USD_per_share",
            observedAt: "2026-08-02T00:00:00.000Z",
            source: "insightsentry",
            signal: "higher_better",
          },
        ],
      },
    });

    expect(selected.questions[0]?.decisionKey).toBe("decision_earnings");
    expect(selected.questions[1]?.decisionKey).toBe(
      "implied_forward_earnings_multiple",
    );
    expect(
      selected.questions.map((question) => question.decisionKey),
    ).not.toContain("strongest_countercase");
    expect(
      selected.questions.map((question) => question.decisionKey),
    ).toContain("consensus_price_gap");
    expect(
      selected.questions.find(
        (question) => question.decisionKey === "consensus_price_gap",
      )?.answer.en,
    ).toContain("20% above");
    expect(
      selected.questions.find(
        (question) =>
          question.decisionKey === "implied_forward_earnings_multiple",
      )?.answer.en,
    ).toContain("20x forward earnings");
    expect(selected.supportedNumbers).toContain("20%");
    expect(
      new Set(selected.questions.map((question) => question.answer.en)).size,
    ).toBe(selected.questions.length);
  });
});
