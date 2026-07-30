import { buildAnticipatedQuestions } from "./anticipatedQuestions";
import type { ResearchFileData } from "./compositions/types";
import type { ResearchReport } from "./domain/report";
import type { ResearchComparison } from "./domain/researchComparison";
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
  return /(?:provided|sealed|licensed|provider|consensus|recommendation|report scope|not replace|cannot (?:quantify|assess|verify)|제공된|봉인된|라이선스|컨센서스|제공사|추천|매수[·/]?매도|대체하지|정량화할 수 없|평가할 수 없|검증할 수 없)/iu.test(
    value,
  );
}

function isReaderEvidenceSource(
  source: ResearchReport["sources"][number],
): boolean {
  return (
    source.sourceClass !== "department_consolidation" &&
    source.sourceClass !== "owner_response_ballot" &&
    source.sourceClass !== "structural_audit" &&
    source.dataset !== "insightsentry_request_ledger"
  );
}

export function researchReportToFile(
  report: ResearchReport,
  createdAt: string,
  comparison?: ResearchComparison,
): ResearchFileData {
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
    scenarios: en.scenarios.map((item, index) => ({
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
