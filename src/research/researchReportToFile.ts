import { buildAnticipatedQuestions } from "./anticipatedQuestions";
import type { ResearchFileData } from "./compositions/types";
import { sanitizePublicEditorialText } from "./domain/editorialQuality";
import type { ResearchReport, WorkflowV2ResearchReport } from "./domain/report";
import type { ResearchComparison } from "./domain/researchComparison";
import { workflowRoleById } from "./domain/roleRegistry";
import { publicDecisionDimensionLabel } from "./publicPresentation";
import {
  compactNarrative,
  evidenceScore,
  narrativeLayers,
  postureLabel,
  qualitativePosture,
  readerSourceLabel,
} from "./researchPresentation";

function localized(en: string, ko: string) {
  return Object.freeze({ en, ko });
}

function readerQuestion(
  _decisionKey: string,
  fallback: { readonly en: string; readonly ko: string },
) {
  return {
    en: sanitizePublicEditorialText(fallback.en),
    ko: sanitizePublicEditorialText(fallback.ko),
  };
}

function readerAnswer(
  report: WorkflowV2ResearchReport,
  question: WorkflowV2ResearchReport["anticipatedQuestions"][number],
) {
  const clean = (value: string) =>
    sanitizePublicEditorialText(value)
      .replace(
        /^(?:이 질문의 핵심 근거는 다음과 같습니다|이 질문의 핵심 근거|The key evidence for this question is)\s*[:：]?\s*/iu,
        "",
      )
      .replace(
        /\b(thesis breaks if)\s+(?:this\s+[^.]{0,100}\s+is\s+invalidated|the\s+thesis\s+is\s+weakened)\s+if\s+/iu,
        "$1 ",
      )
      .replace(
        /\s*Signal to monitor:\s*compare the same metric with the next filing before changing confidence\.?/giu,
        "",
      )
      .replace(
        /\s*다음 공시에서 같은 지표의 방향이 유지되는지 확인하세요\.?/gu,
        "",
      )
      .replace(
        /\s*(?:이 질문에서 볼 신호|Signal to monitor)\s*[:：]?\s*$/iu,
        "",
      )
      .replace(/\s{2,}/gu, " ")
      .trim();
  const leaksInternalKey = Object.values(question.answer).some((answer) =>
    /(?:^|\s)[a-z][a-z0-9_]+_[a-z0-9]{8}\s*$/u.test(answer),
  );
  if (!leaksInternalKey)
    return { en: clean(question.answer.en), ko: clean(question.answer.ko) };
  const claim = question.primaryClaimIds
    .map((claimId) =>
      report.editorialClaims.find((candidate) => candidate.claimId === claimId),
    )
    .find((candidate) => candidate !== undefined);
  if (claim === undefined)
    return { en: clean(question.answer.en), ko: clean(question.answer.ko) };
  const answer = question.decisionKey.includes("_falsifier_")
    ? claim.falsifier
    : claim.publicThesis;
  return {
    en: clean(answer.en),
    ko: clean(answer.ko),
  };
}

function readerAnticipatedQuestions(report: WorkflowV2ResearchReport) {
  const lens = (decisionKey: string) => {
    if (
      /(?:consensus|premium|expectation|valuation|cash_flow|capital_intensity|forward_earnings|multiple)/u.test(
        decisionKey,
      )
    )
      return localized("Calculated lens", "계산 검증");
    if (/(?:countercase|downside|falsifier|breaker)/u.test(decisionKey))
      return localized("Downside test", "반대·하방 검증");
    if (/(?:catalyst|timing|earnings|regime|relative)/u.test(decisionKey))
      return localized("Timing lens", "시점·시장 검증");
    return localized("Decision lens", "투자 판단");
  };
  return [...report.anticipatedQuestions]
    .sort((first, second) => first.rank - second.rank)
    .map((question) => ({
      id: question.questionId,
      decisionKey: question.decisionKey,
      question: readerQuestion(question.decisionKey, question.question),
      answer: readerAnswer(report, question),
      lens: lens(question.decisionKey),
      primaryClaimIds: question.primaryClaimIds,
      evidenceArtifactIds: question.evidenceArtifactIds,
      rank: question.rank,
    }));
}

function compactUsd(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const absolute = Math.abs(numeric);
  const compact = (divisor: number, suffix: "T" | "B" | "M"): string => {
    const scaled = numeric / divisor;
    const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    return `$${scaled.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    })}${suffix}`;
  };
  if (absolute >= 1_000_000_000_000) return compact(1_000_000_000_000, "T");
  if (absolute >= 1_000_000_000) return compact(1_000_000_000, "B");
  if (absolute >= 1_000_000) return compact(1_000_000, "M");
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function scenarioMetricLabel(
  metric: "revenue" | "operating_margin" | "diluted_eps",
) {
  if (metric === "revenue") return localized("Revenue", "매출");
  if (metric === "operating_margin")
    return localized("Operating margin", "영업이익률");
  return localized("Diluted EPS", "희석 EPS");
}

function scenarioDisplayValue(
  value: string,
  unit: "USD" | "USD_per_share" | "percent",
) {
  if (unit === "percent") return localized(`${value}%`, `${value}%`);
  if (unit === "USD_per_share") {
    const display = compactUsd(value);
    return localized(`${display} per share`, `주당 ${display}`);
  }
  const display = compactUsd(value);
  return localized(display, display);
}

function claimStrength(
  verdict: "entailed" | "partial" | "contradicted" | "not_assessable",
  sourceCount: number,
) {
  if (verdict === "contradicted") return "contested" as const;
  if (verdict === "not_assessable") return "unverified" as const;
  if (verdict === "entailed" && sourceCount >= 2) return "strong" as const;
  if (sourceCount > 0) return "moderate" as const;
  return "limited" as const;
}

function isCapabilityDisclaimer(value: string): boolean {
  return /(?:provided|sealed|licensed|provider|consensus|report scope|not replace|cannot (?:quantify|assess|verify)|제공된|봉인된|라이선스|컨센서스|제공사|대체하지|정량화할 수 없|평가할 수 없|검증할 수 없)/iu.test(
    value,
  );
}

function isReaderEvidenceSource(
  source: (ResearchReport | WorkflowV2ResearchReport)["sources"][number],
): boolean {
  return (
    source.sourceClass !== "department_consolidation" &&
    source.sourceClass !== "owner_response_ballot" &&
    source.sourceClass !== "structural_audit" &&
    source.dataset !== "insightsentry_request_ledger"
  );
}

function workflowV2ReportToFile(
  report: WorkflowV2ResearchReport,
  createdAt: string,
  comparison?: ResearchComparison,
): ResearchFileData {
  const authenticatedSourceIds = new Set(
    report.sources.map((source) => source.sourceId),
  );
  const publishableClaimIds = new Set(
    report.claims.flatMap((claim) =>
      claim.semanticVerdict === "entailed" &&
      claim.sourceIds.length > 0 &&
      claim.sourceIds.every((sourceId) => authenticatedSourceIds.has(sourceId))
        ? [claim.claimId]
        : [],
    ),
  );
  const targetDepartmentId =
    report.researchTarget.kind === "department"
      ? report.researchTarget.departmentId
      : undefined;
  const publicEditorialClaims =
    targetDepartmentId === undefined
      ? report.editorialClaims.filter((claim) =>
          publishableClaimIds.has(claim.claimId),
        )
      : report.editorialClaims.filter(
          (claim) =>
            publishableClaimIds.has(claim.claimId) &&
            workflowRoleById(claim.roleOwner)?.departmentId ===
              targetDepartmentId,
        );
  const sanitizedPublicEditorialClaims = publicEditorialClaims.map((claim) => ({
    ...claim,
    publicThesis: {
      en: sanitizePublicEditorialText(claim.publicThesis.en),
      ko: sanitizePublicEditorialText(claim.publicThesis.ko),
    },
    falsifier: {
      en: sanitizePublicEditorialText(claim.falsifier.en),
      ko: sanitizePublicEditorialText(claim.falsifier.ko),
    },
  }));
  const sanitizeLocalized = (value: {
    readonly en: string;
    readonly ko: string;
  }) => ({
    en: sanitizePublicEditorialText(value.en),
    ko: sanitizePublicEditorialText(value.ko),
  });
  const readerSources = report.sources.filter(isReaderEvidenceSource);
  const sourceIds = new Set(readerSources.map((source) => source.sourceId));
  const registeredClaimIds = new Set(
    publicEditorialClaims.map((claim) => claim.claimId),
  );
  const claimsById = new Map(
    report.claims.map((claim) => [claim.claimId, claim]),
  );
  const teamNames = {
    market: localized("Market team · Maya", "시장 팀 · Maya"),
    company: localized("Company team · Ethan", "기업 팀 · Ethan"),
    financial: localized("Financial team · Noah", "재무 팀 · Noah"),
    risk: localized("Risk team · Liam", "리스크 팀 · Liam"),
  } as const;
  const localizedScenarios = report.locales.en.scenarios.flatMap(
    (scenario, index) => {
      const korean = report.locales.ko.scenarios[index];
      if (
        scenario.assumptions.length === 0 ||
        scenario.claimIds.length === 0 ||
        scenario.sourceIds.length === 0 ||
        scenario.claimIds.some((claimId) => !registeredClaimIds.has(claimId)) ||
        scenario.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
      )
        return [];
      return [
        {
          id: scenario.id,
          label: localized(scenario.name, korean?.name ?? scenario.name),
          probability: "",
          thesis: localized(scenario.name, korean?.name ?? scenario.name),
          assumptions: scenario.assumptions.map(({ metric, value, unit }) => ({
            kind: "metric" as const,
            metric: scenarioMetricLabel(metric),
            displayValue: scenarioDisplayValue(value, unit),
            basis: localized(createdAt.slice(0, 10), createdAt.slice(0, 10)),
            sourceRefs: scenario.sourceIds,
          })),
          claimIds: scenario.claimIds,
          sourceArtifactIds: scenario.sourceIds,
        },
      ];
    },
  );
  const valuationClaim = sanitizedPublicEditorialClaims.find(
    (claim) => claim.decisionDimension === "embedded_expectations",
  );
  const catalystClaim = sanitizedPublicEditorialClaims.find(
    (claim) => claim.decisionDimension === "catalyst",
  );
  const totalMetricChecks = report.metrics.reduce(
    (total, metric) => total + metric.denominator,
    0,
  );
  const passedMetricChecks = report.metrics.reduce(
    (total, metric) => total + metric.passed,
    0,
  );
  const empty = localized("", "");
  const koreanSectionsById = new Map(
    report.locales.ko.sections.map((section) => [section.id, section]),
  );
  const editorialAnalysis = report.locales.en.sections
    .filter(
      (section) =>
        section.id !== "ten_second_brief" && section.id !== "dissent_unknowns",
    )
    .filter(
      (section) =>
        section.claimIds.length === 0 ||
        section.claimIds.some((claimId) => publishableClaimIds.has(claimId)),
    )
    .map((section) => {
      // Locales are independent ordered collections. Never pair them by array
      // index: filtering one locale (for example, the brief) shifts every
      // subsequent Korean section by one slot.
      const korean = koreanSectionsById.get(section.id) ?? section;
      const enLayers = narrativeLayers(section.body);
      const koLayers = narrativeLayers(korean.body);
      return {
        title: localized(
          sanitizePublicEditorialText(section.title),
          sanitizePublicEditorialText(korean.title),
        ),
        summary: localized(
          sanitizePublicEditorialText(enLayers.summary),
          sanitizePublicEditorialText(koLayers.summary),
        ),
        detail: localized(
          sanitizePublicEditorialText(enLayers.detail),
          sanitizePublicEditorialText(koLayers.detail),
        ),
      };
    })
    .filter(
      (item) =>
        item.summary.en.trim().length > 0 || item.detail.en.trim().length > 0,
    );
  return {
    presentationVersion: "workflow-v2",
    structuredEditorial: {
      decision: {
        ...report.editorialDecision,
        decisiveReason: sanitizeLocalized(
          report.editorialDecision.decisiveReason,
        ),
        strongestCountercase: sanitizeLocalized(
          report.editorialDecision.strongestCountercase,
        ),
        falsifier: sanitizeLocalized(report.editorialDecision.falsifier),
      },
      claims: sanitizedPublicEditorialClaims,
      claimRegister: report.claims
        .filter((claim) => registeredClaimIds.has(claim.claimId))
        .map((claim) =>
          claim.disposition === undefined
            ? { ...claim, disposition: "accepted" as const }
            : claim,
        ),
      comparators: report.comparators,
      sectionNarratives: report.locales.en.sections
        .filter(
          (section) =>
            section.claimIds.length === 0 ||
            section.claimIds.some((claimId) =>
              publishableClaimIds.has(claimId),
            ),
        )
        .map((section) => {
          const korean = koreanSectionsById.get(section.id) ?? section;
          return {
            id: section.id,
            title: localized(
              sanitizePublicEditorialText(section.title),
              sanitizePublicEditorialText(korean.title),
            ),
            body: localized(
              sanitizePublicEditorialText(section.body),
              sanitizePublicEditorialText(korean.body),
            ),
          };
        }),
      conflicts: publicEditorialClaims.flatMap((claim) =>
        claim.counterevidenceArtifactIds.length === 0
          ? []
          : [
              {
                claimId: claim.claimId,
                counterevidenceArtifactIds: claim.counterevidenceArtifactIds,
              },
            ],
      ),
    },
    reportDecisionFalsifier: report.editorialDecision.falsifier,
    researchTarget: report.researchTarget,
    ...(comparison === undefined ? {} : { comparison }),
    ...(report.researchDirection === undefined
      ? {}
      : { researchDirection: report.researchDirection }),
    ...(report.marketSnapshot === undefined
      ? {}
      : {
          marketSnapshot: {
            price: report.marketSnapshot.lastPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            currency: report.marketSnapshot.currency,
            observedAt: report.marketSnapshot.observedAt,
            marketState: report.marketSnapshot.marketState,
            ...(report.marketSnapshot.change === undefined
              ? {}
              : { change: String(report.marketSnapshot.change) }),
            ...(report.marketSnapshot.changePercent === undefined
              ? {}
              : { changePercent: report.marketSnapshot.changePercent }),
          },
        }),
    ...(report.metricSnapshot === undefined
      ? {}
      : { metricSnapshot: report.metricSnapshot }),
    anticipatedQuestions: readerAnticipatedQuestions(report),
    qualityScorecard: {
      evidenceCoverage:
        totalMetricChecks === 0
          ? 0
          : Math.round((passedMetricChecks / totalMetricChecks) * 100),
      freshnessCoverage:
        readerSources.length === 0
          ? 0
          : Math.round(
              (readerSources.filter((source) => source.freshness === "current")
                .length /
                readerSources.length) *
                100,
            ),
      rebuttalResolution: Math.round(
        (publicEditorialClaims.filter(
          (claim) => claim.counterevidenceArtifactIds.length > 0,
        ).length /
          Math.max(publicEditorialClaims.length, 1)) *
          100,
      ),
    },
    claimMatrix: sanitizedPublicEditorialClaims.map((claim) => {
      const registered = claimsById.get(claim.claimId);
      const verdict = registered?.semanticVerdict ?? "not_assessable";
      return {
        id: claim.claimId,
        claim: claim.publicThesis,
        verdict,
        sourceCount: claim.evidenceArtifactIds.length,
        sourceRefs: claim.evidenceArtifactIds,
        strength: claimStrength(verdict, claim.evidenceArtifactIds.length),
        checkpoint: claim.falsifier,
        roleOwner: claim.roleOwner,
        decisionDimension: claim.decisionDimension,
        decisiveMetricIds: claim.decisiveMetricIds,
        evidenceArtifactIds: claim.evidenceArtifactIds,
        counterevidenceArtifactIds: claim.counterevidenceArtifactIds,
      };
    }),
    evidenceIndex: readerSources.map((source) => ({
      id: source.sourceId,
      publisher: source.publisher,
      title: source.title,
      sourceClass: source.sourceClass,
      ...(source.url === undefined ? {} : { url: source.url }),
      ...(source.observedOrFiledAt === undefined
        ? {}
        : { observedAt: source.observedOrFiledAt }),
      ...(source.freshness === undefined
        ? {}
        : { freshness: source.freshness }),
    })),
    coverage: report.dataCoverage.map((coverage) => ({
      label: coverage.dataset.replaceAll("_", " "),
      provider: coverage.provider,
      status: coverage.status,
      period:
        coverage.observedFrom === undefined || coverage.observedTo === undefined
          ? ""
          : `${coverage.observedFrom.slice(0, 10)}–${coverage.observedTo.slice(0, 10)}`,
    })),
    teamViews: report.teamViews.map((view) => ({
      departmentId: view.departmentId,
      representativeId: view.departmentId,
      teamName: teamNames[view.departmentId],
      position: sanitizeLocalized(view.position),
      vote: view.vote,
      rationale: sanitizeLocalized(view.rationale),
    })),
    posture: "neutral",
    postureLabel: empty,
    limitationNote: empty,
    evidenceScore: {
      passed: passedMetricChecks,
      denominator: totalMetricChecks,
    },
    sourceCount: readerSources.length,
    claimCount: publicEditorialClaims.length,
    asOf: localized(createdAt, createdAt),
    freshness: empty,
    condition: report.editorialDecision.decisiveReason,
    expectation: valuationClaim?.publicThesis ?? empty,
    valuation: valuationClaim?.publicThesis ?? empty,
    nextEvent: catalystClaim?.publicThesis ?? empty,
    thesis: report.editorialDecision.decisiveReason,
    changeCondition: empty,
    positives: sanitizedPublicEditorialClaims
      .filter((claim) => claim.stanceContribution === "supports")
      .map((claim) => claim.publicThesis),
    concerns: [
      report.editorialDecision.strongestCountercase,
      ...sanitizedPublicEditorialClaims
        .filter((claim) => claim.stanceContribution === "opposes")
        .map((claim) => claim.publicThesis),
    ],
    analysis:
      editorialAnalysis.length > 0
        ? editorialAnalysis
        : sanitizedPublicEditorialClaims.map((claim) => ({
            title: localized(
              publicDecisionDimensionLabel(claim.decisionDimension, "en"),
              publicDecisionDimensionLabel(claim.decisionDimension, "ko"),
            ),
            summary: claim.publicThesis,
            detail: claim.falsifier,
          })),
    scenarios: localizedScenarios,
    appendix: [
      {
        title: localized("Evidence register", "근거 목록"),
        items: readerSources.map((source) =>
          localized(source.title, source.title),
        ),
      },
      {
        title: localized("Data coverage", "데이터 범위"),
        items: report.dataCoverage.map((coverage) =>
          localized(
            `${coverage.provider} · ${coverage.dataset} · ${coverage.status}`,
            `${coverage.provider} · ${coverage.dataset} · ${coverage.status}`,
          ),
        ),
      },
    ],
    versions: [
      {
        version: `v${report.version}.0`,
        date: createdAt.slice(0, 10),
        label: localized("Published research file", "발행된 리서치 파일"),
      },
    ],
  };
}

export function researchReportToFile(
  report: ResearchReport | WorkflowV2ResearchReport,
  createdAt: string,
  comparison?: ResearchComparison,
): ResearchFileData {
  if (report.schemaVersion === "workflow-v2")
    return workflowV2ReportToFile(report, createdAt, comparison);
  const en = report.locales.en;
  const ko = report.locales.ko;
  const fallbackEn = en.sections.at(-1);
  const fallbackKo = ko.sections.at(-1);
  if (fallbackEn === undefined || fallbackKo === undefined)
    throw new TypeError("published report has no localized sections");
  const section = (id: string) => ({
    en: en.sections.find((item) => item.id === id) ?? fallbackEn,
    ko: ko.sections.find((item) => item.id === id) ?? fallbackKo,
  });
  const text = (
    id: string,
    options: {
      readonly en: number;
      readonly ko: number;
      readonly sentences?: number;
    } = {
      en: 240,
      ko: 180,
      sentences: 2,
    },
  ) => {
    const pair = section(id);
    return localized(
      compactNarrative(pair.en.body, {
        sentences: options.sentences ?? 2,
        characters: options.en,
      }),
      compactNarrative(pair.ko.body, {
        sentences: options.sentences ?? 2,
        characters: options.ko,
      }),
    );
  };
  const valuationText = () => {
    const valuationPattern =
      /valuation|multiple|peer|financial comparison|밸류|가치평가|멀티플|비교/iu;
    const enSection =
      en.sections.find((item) => item.id === "valuation_comparison") ??
      en.sections.find((item) =>
        valuationPattern.test(`${item.id} ${item.title}`),
      ) ??
      section("supported_analysis").en;
    const koSection =
      ko.sections.find((item) => item.id === enSection.id) ??
      ko.sections.find((item) =>
        valuationPattern.test(`${item.id} ${item.title}`),
      ) ??
      section("supported_analysis").ko;
    return localized(
      compactNarrative(enSection.body, {
        sentences: 3,
        characters: 480,
      }),
      compactNarrative(koSection.body, {
        sentences: 3,
        characters: 360,
      }),
    );
  };
  const missingMandateLanguage =
    /(?:claim|question).{0,36}(?:missing|not supplied|not provided)|(?:주장|질문).{0,28}(?:없|제공되지|누락)/iu;
  const focused = report.researchTarget.kind === "department";
  const dissentConcerns = en.dissent.map((item, index) =>
    localized(item.text, ko.dissent[index]?.text ?? item.text),
  );
  const unknownConcerns = en.unknowns
    .map((item, index) =>
      localized(item.impact, ko.unknowns[index]?.impact ?? item.impact),
    )
    .filter(
      (item) =>
        !isCapabilityDisclaimer(item.en) && !isCapabilityDisclaimer(item.ko),
    );
  const concerns = [
    ...(focused && dissentConcerns.length > 0
      ? dissentConcerns
      : [...dissentConcerns, ...unknownConcerns]),
  ].filter(
    (item) =>
      !missingMandateLanguage.test(item.en) &&
      !missingMandateLanguage.test(item.ko),
  );
  const posture = qualitativePosture(report);
  const currentMarketData = report.capabilities.find(
    (capability) => capability.key === "current_market_data",
  );
  const priceLimited =
    currentMarketData === undefined ||
    currentMarketData.availability !== "available" ||
    report.marketSnapshot === undefined;
  const limitationNote = priceLimited
    ? localized(
        "This edition evaluates valuation through verified operating evidence and reported comparisons.",
        "이 발행본은 검증된 사업·실적 근거와 보고서 내 비교를 중심으로 밸류에이션을 판단합니다.",
      )
    : localized(
        "The judgment reflects evidence verified as of the report time and can change as new evidence arrives.",
        "이 판단은 보고서 기준 시점에 검증된 근거를 반영하며 새 근거에 따라 달라질 수 있습니다.",
      );
  const boilerplate =
    /(?:incorporated|headquarter|common stock|trades? on|issuer|설립|본사|보통주|종목코드|발행사)/iu;
  const displayClaims = report.claims.filter(
    (claim) =>
      claim.semanticVerdict === "entailed" &&
      claim.sourceIds.length > 0 &&
      claim.sourceIds.every((sourceId) =>
        report.sources.some((source) => source.sourceId === sourceId),
      ) &&
      (report.researchTarget.kind === "department" ||
        claim.materiality === "material") &&
      claim.text !== undefined &&
      !boilerplate.test(`${claim.text.en} ${claim.text.ko}`) &&
      !missingMandateLanguage.test(`${claim.text.en} ${claim.text.ko}`),
  );
  const totalMetricChecks = report.metrics.reduce(
    (total, metric) => total + metric.denominator,
    0,
  );
  const passedMetricChecks = report.metrics.reduce(
    (total, metric) => total + metric.passed,
    0,
  );
  const freshnessSources = report.sources.filter(
    (source) => source.freshness !== undefined,
  );
  const freshnessCoverage =
    freshnessSources.length > 0
      ? Math.round(
          (freshnessSources.filter((source) => source.freshness === "current")
            .length /
            freshnessSources.length) *
            100,
        )
      : report.dataCoverage.length === 0
        ? 0
        : Math.round(
            (report.dataCoverage.filter(
              (coverage) => coverage.status === "available",
            ).length /
              report.dataCoverage.length) *
              100,
          );
  const assessedClaims = displayClaims.filter(
    (claim) => claim.semanticVerdict !== "not_assessable",
  );
  const positiveClaims = displayClaims.flatMap((claim) =>
    claim.text === undefined
      ? []
      : [
          localized(
            compactNarrative(claim.text.en, {
              sentences: 2,
              characters: 280,
            }),
            compactNarrative(claim.text.ko, {
              sentences: 2,
              characters: 220,
            }),
          ),
        ],
  );
  const rawNextEvent = text("operational_scenarios", {
    en: 360,
    ko: 280,
    sentences: 2,
  });
  const rawChangeCondition = text("change_conditions", {
    en: 360,
    ko: 280,
    sentences: 2,
  });
  const numericConcern =
    concerns.find((item) => /\d/u.test(`${item.en} ${item.ko}`)) ?? concerns[0];
  const alternateConcern =
    concerns.find((item) => item !== numericConcern) ?? concerns[0];
  const nextEvent =
    focused &&
    (isCapabilityDisclaimer(rawNextEvent.en) ||
      isCapabilityDisclaimer(rawNextEvent.ko))
      ? (numericConcern ?? rawNextEvent)
      : rawNextEvent;
  const changeCondition =
    focused &&
    (isCapabilityDisclaimer(rawChangeCondition.en) ||
      isCapabilityDisclaimer(rawChangeCondition.ko))
      ? (alternateConcern ?? rawChangeCondition)
      : rawChangeCondition;
  const teamNames = {
    market: localized("Market team · Maya", "시장 팀 · Maya"),
    company: localized("Company team · Ethan", "기업 팀 · Ethan"),
    financial: localized("Financial team · Noah", "재무 팀 · Noah"),
    risk: localized("Risk team · Liam", "리스크 팀 · Liam"),
  } as const;
  const readerSources = report.sources.filter(isReaderEvidenceSource);
  const sourceRefById = new Map(
    readerSources.map((source, index) => [
      source.sourceId,
      `S${String(index + 1).padStart(2, "0")}`,
    ]),
  );
  const file: ResearchFileData = {
    presentationVersion: "legacy-v1",
    researchTarget: report.researchTarget,
    ...(comparison === undefined ? {} : { comparison }),
    ...(report.researchDirection === undefined
      ? {}
      : { researchDirection: report.researchDirection }),
    ...(report.marketSnapshot === undefined
      ? {}
      : {
          marketSnapshot: {
            price: report.marketSnapshot.lastPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            currency: report.marketSnapshot.currency,
            observedAt: report.marketSnapshot.observedAt,
            marketState: report.marketSnapshot.marketState,
            ...(report.marketSnapshot.change === undefined
              ? {}
              : {
                  change: report.marketSnapshot.change.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signDisplay: "always",
                  }),
                }),
            ...(report.marketSnapshot.changePercent === undefined
              ? {}
              : { changePercent: report.marketSnapshot.changePercent }),
          },
        }),
    ...(report.metricSnapshot === undefined
      ? {}
      : { metricSnapshot: report.metricSnapshot }),
    qualityScorecard: {
      evidenceCoverage:
        totalMetricChecks === 0
          ? 0
          : Math.round((passedMetricChecks / totalMetricChecks) * 100),
      freshnessCoverage,
      rebuttalResolution:
        displayClaims.length === 0
          ? 0
          : Math.round((assessedClaims.length / displayClaims.length) * 100),
    },
    claimMatrix: displayClaims.slice(0, 8).flatMap((claim, index) =>
      claim.text === undefined
        ? []
        : [
            {
              id: `C${String(index + 1).padStart(2, "0")}`,
              claim: claim.text,
              verdict: claim.semanticVerdict,
              sourceCount: claim.sourceIds.length,
              sourceRefs: claim.sourceIds.flatMap((sourceId) => {
                const reference = sourceRefById.get(sourceId);
                return reference === undefined ? [] : [reference];
              }),
              strength: claimStrength(
                claim.semanticVerdict,
                claim.sourceIds.length,
              ),
              ...(en.dissent.find((item) => item.claimId === claim.claimId) ===
                undefined &&
              ko.dissent.find((item) => item.claimId === claim.claimId) ===
                undefined
                ? {}
                : {
                    counterpoint: localized(
                      compactNarrative(
                        en.dissent.find(
                          (item) => item.claimId === claim.claimId,
                        )?.text ??
                          ko.dissent.find(
                            (item) => item.claimId === claim.claimId,
                          )?.text ??
                          "",
                        { sentences: 2, characters: 300 },
                      ),
                      compactNarrative(
                        ko.dissent.find(
                          (item) => item.claimId === claim.claimId,
                        )?.text ??
                          en.dissent.find(
                            (item) => item.claimId === claim.claimId,
                          )?.text ??
                          "",
                        { sentences: 2, characters: 240 },
                      ),
                    ),
                  }),
              checkpoint: localized(
                compactNarrative(changeCondition.en, {
                  sentences: 2,
                  characters: 260,
                }),
                compactNarrative(changeCondition.ko, {
                  sentences: 2,
                  characters: 200,
                }),
              ),
            },
          ],
    ),
    evidenceIndex: readerSources.map((source, index) => {
      const label = readerSourceLabel(source);
      return {
        id: `S${String(index + 1).padStart(2, "0")}`,
        publisher: label.publisher,
        title: label.title,
        sourceClass: source.sourceClass,
        ...(source.url === undefined ? {} : { url: source.url }),
        ...(source.observedOrFiledAt === undefined
          ? {}
          : { observedAt: source.observedOrFiledAt }),
        ...(source.freshness === undefined
          ? {}
          : { freshness: source.freshness }),
      };
    }),
    coverage: report.dataCoverage.map((coverage) => ({
      label: coverage.dataset.replaceAll("_", " "),
      provider: coverage.provider,
      status: coverage.status,
      period:
        coverage.observedFrom === undefined || coverage.observedTo === undefined
          ? "—"
          : `${coverage.observedFrom.slice(0, 10)}–${coverage.observedTo.slice(0, 10)}`,
    })),
    teamViews: report.teamViews.map((view) => ({
      departmentId: view.departmentId,
      representativeId: view.departmentId,
      teamName: teamNames[view.departmentId],
      position: localized(
        compactNarrative(view.position.en, {
          sentences: 2,
          characters: 360,
        }),
        compactNarrative(view.position.ko, {
          sentences: 2,
          characters: 280,
        }),
      ),
      vote: view.vote,
      rationale: localized(
        compactNarrative(view.rationale.en, {
          sentences: 2,
          characters: 420,
        }),
        compactNarrative(view.rationale.ko, {
          sentences: 2,
          characters: 330,
        }),
      ),
    })),
    posture,
    postureLabel: localized(
      postureLabel(posture, "en"),
      postureLabel(posture, "ko"),
    ),
    limitationNote,
    evidenceScore: evidenceScore(report),
    sourceCount: readerSources.length,
    claimCount: report.claims.length,
    asOf: localized(createdAt, createdAt),
    freshness: localized(
      `${report.sources.filter((source) => source.freshness === "current").length}/${report.sources.length} sources marked current`,
      `출처 ${report.sources.length}개 중 ${report.sources.filter((source) => source.freshness === "current").length}개 최신`,
    ),
    condition: localized(
      posture === "positive"
        ? "Evidence supports a constructive view, subject to the stated change conditions."
        : posture === "caution"
          ? "Material uncertainty keeps the evidence posture cautious."
          : "Evidence is balanced; the next decision depends on explicit operating conditions.",
      posture === "positive"
        ? "핵심 근거는 긍정적이지만 명시된 변경 조건을 함께 봐야 합니다."
        : posture === "caution"
          ? "중요한 불확실성이 남아 있어 신중한 판단이 필요합니다."
          : "근거가 엇갈려 있어 다음 판단은 명시된 사업 조건에 달려 있습니다.",
    ),
    expectation: text("supported_analysis", {
      en: 420,
      ko: 320,
      sentences: 3,
    }),
    valuation: priceLimited
      ? valuationText()
      : localized(
          `${report.marketSnapshot?.currency} ${report.marketSnapshot?.lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} current price · ${valuationText().en}`,
          `현재가 ${report.marketSnapshot?.lastPrice.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${report.marketSnapshot?.currency} · ${valuationText().ko}`,
        ),
    nextEvent,
    thesis: (() => {
      const pair = section("ten_second_brief");
      return localized(
        compactNarrative(pair.en.body, { sentences: 3, characters: 460 }),
        compactNarrative(pair.ko.body, { sentences: 3, characters: 340 }),
      );
    })(),
    changeCondition,
    positives:
      positiveClaims.length > 0
        ? positiveClaims.slice(0, 3)
        : [text("supported_analysis")],
    concerns: concerns
      .slice(0, 3)
      .map((item) =>
        localized(
          compactNarrative(item.en, { sentences: 2, characters: 280 }),
          compactNarrative(item.ko, { sentences: 2, characters: 220 }),
        ),
      ),
    analysis: en.sections
      .filter(
        (item) =>
          item.id !== "ten_second_brief" &&
          item.id !== "dissent_unknowns" &&
          (!focused || !isCapabilityDisclaimer(item.body)),
      )
      .map((item) => {
        const koItem = ko.sections.find(
          (candidate) => candidate.id === item.id,
        );
        const koBody = koItem?.body ?? item.body;
        const enLayers = narrativeLayers(item.body);
        const koLayers = narrativeLayers(koBody);
        return {
          title: localized(item.title, koItem?.title ?? item.title),
          summary: localized(enLayers.summary, koLayers.summary),
          detail: localized(enLayers.detail, koLayers.detail),
        };
      }),
    scenarios: en.scenarios
      .filter(
        (item) =>
          item.claimIds.length > 0 &&
          item.claimIds.every((claimId) =>
            displayClaims.some((claim) => claim.claimId === claimId),
          ) &&
          item.sourceIds.length > 0 &&
          item.sourceIds.every((sourceId) => sourceRefById.has(sourceId)),
      )
      .map((item, index) => ({
        id: item.id,
        label: localized(item.name, ko.scenarios[index]?.name ?? item.name),
        probability: "—",
        thesis: localized(item.name, ko.scenarios[index]?.name ?? item.name),
        assumptions:
          item.claimIds.length === 0
            ? [
                {
                  kind: "unverified" as const,
                  note: localized(
                    "Numeric assumption withheld until claim-level support is linked",
                    "주장 단위 근거가 연결될 때까지 정량 가정을 표시하지 않음",
                  ),
                },
              ]
            : item.assumptions.map(({ metric, value, unit }) => ({
                kind: "metric" as const,
                metric: scenarioMetricLabel(metric),
                displayValue: scenarioDisplayValue(value, unit),
                basis: localized(
                  `Scenario assumption · report basis ${createdAt.slice(0, 10)}`,
                  `시나리오 가정 · 보고서 기준 ${createdAt.slice(0, 10)}`,
                ),
                sourceRefs: item.sourceIds.flatMap((sourceId) => {
                  const reference = sourceRefById.get(sourceId);
                  return reference === undefined ? [] : [reference];
                }),
              })),
      })),
    appendix: [
      {
        title: localized("Preserved dissent", "보존된 이견"),
        items: concerns,
      },
      {
        title: localized("Evidence register", "근거 목록"),
        items: report.sources.map((source) => {
          const label = readerSourceLabel(source);
          return localized(
            `${label.publisher} · ${label.title}`,
            `${label.publisher} · ${label.title}`,
          );
        }),
      },
      {
        title: localized(
          "Data coverage and provider status",
          "데이터 범위와 공급자 상태",
        ),
        items: report.dataCoverage.map((coverage) => {
          const period =
            coverage.observedFrom === undefined ||
            coverage.observedTo === undefined
              ? "observed period unavailable"
              : `${coverage.observedFrom.slice(0, 10)}–${coverage.observedTo.slice(0, 10)}`;
          const count =
            coverage.observationCount === undefined
              ? ""
              : ` · ${coverage.observationCount} observations`;
          const limitation =
            coverage.limitation === undefined
              ? ""
              : ` · limitation: ${coverage.limitation}`;
          return localized(
            `${coverage.provider} · ${coverage.dataset} · ${coverage.status} · ${period}${count}${limitation}`,
            `${coverage.provider} · ${coverage.dataset} · ${coverage.status} · ${period}${count}${limitation}`,
          );
        }),
      },
      {
        title: localized(
          "Official/provider disagreement",
          "공식 자료와 공급자 자료의 불일치",
        ),
        items: report.providerDisagreements.map((entry) => entry.note),
      },
    ],
    versions: [
      {
        version: `v${report.version}.0`,
        date: createdAt.slice(0, 10),
        label: localized("Published research file", "발행된 리서치 파일"),
      },
    ],
  };
  return {
    ...file,
    anticipatedQuestions: buildAnticipatedQuestions(file),
  };
}
