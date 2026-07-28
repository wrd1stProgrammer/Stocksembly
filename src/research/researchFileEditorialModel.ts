import type { Locale } from "../lib/i18n";
import type {
  LocalizedText,
  ResearchEvidenceStrength,
  ResearchFileData,
} from "./compositions/types";
import {
  buildEditorialInsights,
  type EditorialDebate,
  type EditorialSnapshotRow,
} from "./researchFileEditorialInsights";

type EditorialLensRow = {
  readonly label: string;
  readonly content: string;
};

type EditorialAnalysisRow = {
  readonly id: string;
  readonly title: string;
  readonly agentView: string;
  readonly evidence: string;
  readonly counterpoint: string;
  readonly checkpoint: string;
  readonly evidenceId?: string;
  readonly strength: ResearchEvidenceStrength;
};

type EditorialComparisonRow = {
  readonly label: string;
  readonly companyView: string;
  readonly benchmarkLens: string;
  readonly interpretation: string;
  readonly evidenceId?: string;
};

type EditorialTeamRow = {
  readonly departmentId: ResearchFileData["teamViews"][number]["departmentId"];
  readonly teamName: string;
  readonly vote: ResearchFileData["teamViews"][number]["vote"];
  readonly strongestClaim: string;
  readonly evidence: string;
  readonly portraitPath: string;
};

export type EditorialCallout = {
  readonly headline: string;
  readonly body: string;
};

export type ResearchFileEditorialModel = {
  readonly question: string;
  readonly directAnswer: string;
  readonly posture: string;
  readonly conclusionIndex: number;
  readonly conclusionLabel: string;
  readonly evidenceReliability: number;
  readonly headlineMetrics: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly lensRows: readonly EditorialLensRow[];
  readonly companySnapshot: readonly EditorialSnapshotRow[];
  readonly catalysts: readonly EditorialCallout[];
  readonly risks: readonly EditorialCallout[];
  readonly coverage: ResearchFileData["coverage"];
  readonly analysisRows: readonly EditorialAnalysisRow[];
  readonly valuationConclusion: string;
  readonly nextVerificationEvent: string;
  readonly comparisonRows: readonly EditorialComparisonRow[];
  readonly scenarios: readonly {
    readonly id: string;
    readonly label: string;
    readonly thesis: string;
    readonly assumptions: readonly string[];
  }[];
  readonly teamRows: readonly EditorialTeamRow[];
  readonly debates: readonly EditorialDebate[];
  readonly initialView: string;
  readonly finalView: string;
  readonly acceptedClaims: readonly string[];
  readonly preservedDissent: readonly string[];
  readonly evidenceIndex: ResearchFileData["evidenceIndex"];
};

function localized(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

function present(value: string, locale: Locale): string {
  if (locale === "ko")
    return value
      .replace(
        /반등 가능성은 있으나 기본 시나리오는 아닙니다\.?/gu,
        "과매도 반등 가능성은 열려 있지만, 지속 반등을 확인할 근거는 아직 부족합니다.",
      )
      .replace(/기본 시나리오는/gu, "현재 증거가 가리키는 전망은")
      .replace(/기본 시나리오/gu, "현재 전망")
      .replace(/거시 스냅샷/gu, "거시 지표")
      .replace(/(?:근거|데이터) 스냅샷/gu, "확인된 근거")
      .replace(/스냅샷/gu, "근거 묶음")
      .trim();
  return value
    .replace(
      /a rebound is possible, but it is not the base case\.?/giu,
      "A relief rebound remains possible, but evidence does not yet confirm a durable reversal.",
    )
    .replace(/the base case is/giu, "Current evidence points to")
    .replace(/base case/giu, "current outlook")
    .replace(/macro snapshot/giu, "macro indicators")
    .replace(/(?:evidence|data) snapshot/giu, "verified evidence")
    .replace(/snapshot/giu, "evidence set")
    .trim();
}

function presentLocalized(value: LocalizedText, locale: Locale): string {
  return present(localized(value, locale), locale);
}

function removeFalsePriceAbsence(value: string, locale: Locale): string {
  const cleaned =
    locale === "ko"
      ? value
          .replace(
            /\s*(?:하지만|다만|그러나),?\s*[^.!?。！？]*(?:현재\s*(?:주가|가격)|현\s*주가|가격[·/]밸류에이션)[^.!?。！？]*(?:없|부재|판단할 수 없|확인할 수 없)[.!?。！？]?/giu,
            "",
          )
          .replace(
            /[^.!?。！？]*(?:현재\s*(?:주가|가격)|현\s*주가)[^.!?。！？]*(?:없|부재|확인할 수 없)[.!?。！？]?/giu,
            "",
          )
      : value
          .replace(
            /\s*(?:but|however),?\s*[^.!?]*(?:current (?:share )?price|price and valuation)[^.!?]*(?:unavailable|not available|cannot (?:be )?(?:assessed|determined))[.!?]?/giu,
            "",
          )
          .replace(
            /[^.!?]*current (?:share )?price[^.!?]*(?:unavailable|not available)[.!?]?/giu,
            "",
          );
  return cleaned.replace(/\s{2,}/gu, " ").trim();
}

function combineDistinct(first: string, second: string): string {
  if (first.includes(second)) return first;
  if (second.includes(first)) return second;
  const separator = /[.!?。！？]$/u.test(first) ? " " : ". ";
  return `${first}${separator}${second}`;
}

function claimDepartment(
  claim: string,
): ResearchFileData["teamViews"][number]["departmentId"] {
  if (
    /가격|주가|추세|금리|수급|rsi|macd|price|trend|yield|market/iu.test(claim)
  )
    return "market";
  if (
    /마진|이익|현금|재무|부채|희석|margin|profit|cash|financial|dilution/iu.test(
      claim,
    )
  )
    return "financial";
  if (
    /제품|인도|매출|고객|경쟁|ai|로보|product|deliver|revenue|customer|competition/iu.test(
      claim,
    )
  )
    return "company";
  return "risk";
}

function readerEvidenceLabel(
  publisher: string,
  title: string,
  locale: Locale,
): { readonly publisher: string; readonly title: string } {
  if (locale === "ko" && /U\.?S\.? Treasury/iu.test(publisher))
    return {
      publisher: "미국 재무부",
      title: /yield curve/iu.test(title)
        ? "공식 국채 수익률 곡선"
        : present(title, locale),
    };
  return { publisher, title };
}

function claimEvidence(
  file: ResearchFileData,
  claim: NonNullable<ResearchFileData["claimMatrix"]>[number],
  locale: Locale,
): string {
  const sources = claim.sourceRefs
    .map((sourceId) =>
      file.evidenceIndex.find((source) => source.id === sourceId),
    )
    .filter((source) => source !== undefined)
    .map((source) => {
      const label = readerEvidenceLabel(
        source.publisher,
        source.title,
        locale,
      );
      return `${label.publisher} · ${label.title}`;
    });
  if (sources.length === 0)
    return locale === "ko"
      ? "주장 단위 근거가 아직 연결되지 않았습니다."
      : "Claim-level evidence is not yet linked.";
  return sources.join("\n");
}

function conclusionIndex(file: ResearchFileData): number {
  const voteScores = {
    support: 100,
    support_with_reservations: 70,
    oppose: 15,
    abstain: 50,
  } as const;
  const teamScore =
    file.teamViews.reduce((sum, team) => sum + voteScores[team.vote], 0) /
    Math.max(file.teamViews.length, 1);
  const claimScores = (file.claimMatrix ?? []).map((claim) => {
    if (claim.verdict === "contradicted") return 20;
    if (claim.verdict === "not_assessable") return 50;
    if (claim.verdict === "partial")
      return claim.strength === "moderate" || claim.strength === "strong"
        ? 65
        : 55;
    if (claim.strength === "strong") return 90;
    if (claim.strength === "moderate") return 78;
    return 68;
  });
  const claimScore =
    claimScores.length === 0
      ? 50
      : claimScores.reduce((sum, score) => sum + score, 0) /
        claimScores.length;
  const postureScore =
    file.posture === "positive" ? 85 : file.posture === "caution" ? 40 : 55;
  return Math.round(teamScore * 0.4 + claimScore * 0.35 + postureScore * 0.25);
}

function reliability(file: ResearchFileData): number {
  if (file.qualityScorecard !== undefined)
    return Math.round(
      (file.qualityScorecard.evidenceCoverage +
        file.qualityScorecard.freshnessCoverage +
        file.qualityScorecard.rebuttalResolution) /
        3,
    );
  return file.evidenceScore.denominator === 0
    ? 0
    : Math.round(
        (file.evidenceScore.passed / file.evidenceScore.denominator) * 100,
      );
}

function callout(
  value: string,
  supportingCopy: string | undefined,
  fallback: string,
): EditorialCallout {
  const normalized = value.trim();
  const boundary = normalized.match(/^.*?[.!?。！？](?:\s|$)/u)?.[0]?.trim();
  const normalizedHeadline = boundary ?? normalized;
  const remainder =
    boundary === undefined ? "" : normalized.slice(boundary.length).trim();
  const normalizedBody = (remainder || supportingCopy || fallback).trim();
  return {
    headline: normalizedHeadline,
    body:
      normalizedBody === normalizedHeadline
        ? fallback.trim()
        : normalizedBody,
  };
}

export function buildResearchFileEditorialModel(
  file: ResearchFileData,
  locale: Locale,
): ResearchFileEditorialModel {
  const ko = locale === "ko";
  const display = (value: LocalizedText) => {
    const presented = presentLocalized(value, locale);
    return file.marketSnapshot === undefined
      ? presented
      : removeFalsePriceAbsence(presented, locale);
  };
  const concerns = file.concerns.map(display).filter((item) => item.length > 0);
  const positives = file.positives.map(display).filter((item) => item.length > 0);
  const question =
    file.researchDirection ??
    (ko
      ? "현재 공개 근거는 이 기업의 사업 경쟁력과 기대 수준을 어떻게 설명하는가?"
      : "How does current public evidence explain the company's business quality and embedded expectations?");
  const baseAnswer = display(file.thesis);
  const posture = localized(file.postureLabel, locale);
  const teamViews = file.teamViews.map((team) => ({
    departmentId: team.departmentId,
    teamName: localized(team.teamName, locale),
    vote: team.vote,
    strongestClaim: display(team.position),
    evidence: display(team.rationale),
    portraitPath: `/research/office-v7/portraits/${team.departmentId}.png`,
  }));
  const teamByDepartment = (
    departmentId: ResearchFileData["teamViews"][number]["departmentId"],
  ) => teamViews.find((team) => team.departmentId === departmentId);
  const financialTeam = teamByDepartment("financial");
  const riskTeam = teamByDepartment("risk");
  const companyTeam = teamByDepartment("company");
  const marketTeam = teamByDepartment("market");
  const fallbackAnalysis = [
    {
      title: { en: "Market expectations", ko: "시장 기대" },
      summary: file.expectation,
      detail: file.expectation,
    },
    {
      title: { en: "Valuation evidence", ko: "밸류에이션 근거" },
      summary: file.valuation,
      detail: file.valuation,
    },
    {
      title: { en: "Next validation event", ko: "다음 검증 이벤트" },
      summary: file.nextEvent,
      detail: file.nextEvent,
    },
    {
      title: { en: "Change condition", ko: "판단 변경 조건" },
      summary: file.changeCondition,
      detail: file.changeCondition,
    },
  ] satisfies readonly {
    readonly title: LocalizedText;
    readonly summary: LocalizedText;
    readonly detail: LocalizedText;
  }[];
  const analysisItems = [...file.analysis, ...fallbackAnalysis]
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            localized(candidate.title, locale) ===
            localized(item.title, locale),
        ) === index,
    )
    .slice(0, 6);
  const departmentCounts = new Map<
    ResearchFileData["teamViews"][number]["departmentId"],
    number
  >();
  const selectedClaims = (file.claimMatrix ?? []).filter((claim) => {
    const department = claimDepartment(presentLocalized(claim.claim, locale));
    const count = departmentCounts.get(department) ?? 0;
    if (count >= 2) return false;
    departmentCounts.set(department, count + 1);
    return true;
  });
  const claimRows: EditorialAnalysisRow[] = selectedClaims.map(
    (claim, index) => {
      const title = presentLocalized(claim.claim, locale);
      const relatedTeam = teamByDepartment(claimDepartment(title));
      const fallbackCounterpoint =
        concerns[index % Math.max(concerns.length, 1)] ??
        (ko
          ? "현재 강점이 이어지더라도 반대 신호와 판단 변경 조건을 함께 확인해야 합니다."
          : "Even if current strengths persist, opposing signals and change conditions still require confirmation.");
      return {
        id: `A${String(index + 1).padStart(2, "0")}`,
        title,
        agentView:
          relatedTeam?.evidence ?? presentLocalized(file.condition, locale),
        evidence: claimEvidence(file, claim, locale),
        counterpoint:
          claim.counterpoint === undefined
            ? claim.verdict === "partial"
              ? ko
                ? `근거가 이 논지를 일부만 지지합니다. ${fallbackCounterpoint}`
                : `Evidence only partially supports this thesis. ${fallbackCounterpoint}`
              : claim.verdict === "contradicted"
                ? ko
                  ? `연결 근거가 이 논지와 충돌합니다. ${fallbackCounterpoint}`
                  : `Linked evidence conflicts with this thesis. ${fallbackCounterpoint}`
                : fallbackCounterpoint
            : presentLocalized(claim.counterpoint, locale),
        checkpoint:
          claim.checkpoint === undefined
            ? presentLocalized(
                index % 2 === 0 ? file.nextEvent : file.changeCondition,
                locale,
              )
            : presentLocalized(claim.checkpoint, locale),
        evidenceId: claim.id,
        strength: claim.strength,
      };
    },
  );
  const remainingRowCount = Math.max(0, 5 - claimRows.length);
  const analysisRows: EditorialAnalysisRow[] = [
    ...claimRows,
    ...analysisItems.slice(0, remainingRowCount).map((item, index) => ({
      id: `A${String(claimRows.length + index + 1).padStart(2, "0")}`,
      title: presentLocalized(item.title, locale),
      agentView: presentLocalized(item.summary, locale),
      evidence: presentLocalized(item.detail, locale),
      counterpoint:
        concerns[index % Math.max(concerns.length, 1)] ??
        presentLocalized(file.condition, locale),
      checkpoint: presentLocalized(
        index % 2 === 0 ? file.nextEvent : file.changeCondition,
        locale,
      ),
      strength: "unverified" as const,
    })),
  ];
  const editorialInsights = buildEditorialInsights({
    file,
    locale,
    teams: teamViews,
    analysisRows,
    baseAnswer,
    valuation: presentLocalized(file.valuation, locale),
    nextVerification: presentLocalized(file.nextEvent, locale),
    changeCondition: presentLocalized(file.changeCondition, locale),
  });
  const {
    companySnapshot,
    debates,
    directAnswer,
    finalView,
    initialView,
    valuationConclusion,
  } = editorialInsights;
  const catalystCopy = [
    ...new Set([...positives, ...analysisRows.map((item) => item.agentView)]),
  ].slice(0, 3);
  const riskCopy = [
    ...new Set([...concerns, ...analysisRows.map((item) => item.counterpoint)]),
  ].slice(0, 3);
  const catalysts = catalystCopy.map((item, index) =>
    callout(
      item,
      analysisRows[index]?.agentView,
      analysisRows[index]?.checkpoint ??
        presentLocalized(file.nextEvent, locale),
    ),
  );
  const risks = riskCopy.map((item, index) =>
    callout(
      item,
      analysisRows[index]?.counterpoint,
      analysisRows[index]?.checkpoint ??
        presentLocalized(file.changeCondition, locale),
    ),
  );
  const comparisonRows: EditorialComparisonRow[] = [
    {
      label: ko ? "가격·추세" : "Price & trend",
      companyView:
        marketTeam?.strongestClaim ??
        presentLocalized(file.expectation, locale),
      benchmarkLens: presentLocalized(file.expectation, locale),
      interpretation:
        marketTeam?.evidence ?? presentLocalized(file.condition, locale),
    },
    {
      label: ko ? "사업 전환" : "Business conversion",
      companyView:
        companyTeam?.strongestClaim ?? presentLocalized(file.thesis, locale),
      benchmarkLens: positives[0] ?? presentLocalized(file.nextEvent, locale),
      interpretation:
        companyTeam?.evidence ?? presentLocalized(file.changeCondition, locale),
    },
    {
      label: ko ? "이익의 질" : "Earnings quality",
      companyView:
        financialTeam?.strongestClaim ??
        presentLocalized(file.valuation, locale),
      benchmarkLens: presentLocalized(file.valuation, locale),
      interpretation:
        financialTeam?.evidence ??
        presentLocalized(file.changeCondition, locale),
    },
    {
      label: ko ? "하방 기준" : "Downside threshold",
      companyView:
        riskTeam?.strongestClaim ??
        concerns[0] ??
        presentLocalized(file.condition, locale),
      benchmarkLens: presentLocalized(file.changeCondition, locale),
      interpretation:
        riskTeam?.evidence ??
        concerns[1] ??
        presentLocalized(file.nextEvent, locale),
    },
  ];
  const sourceScenarios = file.scenarios
    .map((scenario) => ({
      id: scenario.id,
      label: /^(?:base|기본|기준)$/iu.test(localized(scenario.label, locale))
        ? ko
          ? "현재 근거 전망"
          : "Current evidence outlook"
        : presentLocalized(scenario.label, locale),
      thesis: presentLocalized(scenario.thesis, locale),
      assumptions: scenario.assumptions.map((assumption) =>
        assumption.kind === "metric"
          ? `${localized(assumption.metric, locale)} ${localized(assumption.displayValue, locale)} · ${localized(assumption.basis, locale)}`
          : presentLocalized(assumption.note, locale),
      ),
    }))
    .filter(
      (scenario) =>
        scenario.assumptions.length >= 2 ||
        (scenario.thesis.length >= 40 &&
          scenario.thesis.trim() !== scenario.label.trim()),
    );
  const scenarios =
    sourceScenarios.length > 0
      ? sourceScenarios
      : [
          {
            id: "recovery-path",
            label: ko ? "반등 확인 조건" : "Rebound confirmation",
            thesis:
              companyTeam?.strongestClaim ??
              positives[0] ??
              presentLocalized(file.nextEvent, locale),
            assumptions: [
              positives[0],
              presentLocalized(file.nextEvent, locale),
            ].filter((value): value is string => value !== undefined),
          },
          {
            id: "current-view",
            label: ko ? "현재 판단 유지" : "Current view holds",
            thesis: directAnswer,
            assumptions: [
              marketTeam?.evidence,
              financialTeam?.evidence,
            ].filter((value): value is string => value !== undefined),
          },
          {
            id: "downside-path",
            label: ko ? "하방 확대 조건" : "Downside expansion",
            thesis:
              riskTeam?.strongestClaim ??
              concerns[0] ??
              presentLocalized(file.changeCondition, locale),
            assumptions: [
              concerns[0],
              presentLocalized(file.changeCondition, locale),
            ].filter((value): value is string => value !== undefined),
          },
        ];
  const teamRows: readonly EditorialTeamRow[] = teamViews;
  const resultIndex = conclusionIndex(file);
  const evidenceReliability = reliability(file);
  const teamAgreement = Math.round(
    (file.teamViews.filter(
      (team) =>
        team.vote === "support" || team.vote === "support_with_reservations",
    ).length /
      Math.max(file.teamViews.length, 1)) *
      100,
  );
  return {
    question,
    directAnswer,
    posture,
    conclusionIndex: resultIndex,
    conclusionLabel:
      resultIndex >= 70
        ? ko
          ? "긍정 논지 우세"
          : "Constructive case leads"
        : resultIndex >= 45
          ? ko
            ? "근거 혼재"
            : "Evidence is mixed"
          : ko
            ? "하방 논지 우세"
            : "Downside case leads",
    evidenceReliability,
    headlineMetrics: [
      {
        label: ko ? "현재가" : "Observed price",
        value:
          file.marketSnapshot === undefined
            ? "—"
            : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`,
      },
      {
        label: ko ? "팀 동의" : "Team agreement",
        value: `${teamAgreement}%`,
      },
      {
        label: ko ? "근거 신뢰도" : "Evidence reliability",
        value: `${evidenceReliability}%`,
      },
      {
        label: ko ? "반론 검증" : "Rebuttal resolution",
        value: `${file.qualityScorecard?.rebuttalResolution ?? evidenceReliability}%`,
      },
    ],
    companySnapshot,
    lensRows: [
      {
        label: ko ? "시장의 기본 기대" : "Market baseline",
        content: combineDistinct(
          marketTeam?.strongestClaim ??
            presentLocalized(file.expectation, locale),
          presentLocalized(file.expectation, locale),
        ),
      },
      {
        label: ko ? "가격에 반영된 기대" : "Embedded expectations",
        content: combineDistinct(
          presentLocalized(file.valuation, locale),
          financialTeam?.strongestClaim ??
            presentLocalized(file.condition, locale),
        ),
      },
      {
        label: ko ? "에이전트 팀의 관점" : "Agent team view",
        content: directAnswer,
      },
      {
        label: ko ? "판단이 갈리는 지점" : "Point of disagreement",
        content:
          concerns[0] ??
          (ko
            ? "중요한 반대 근거가 확인되지 않았습니다."
            : "No material counter-evidence was identified."),
      },
      {
        label: ko ? "우리 판단이 틀릴 조건" : "What would prove us wrong",
        content: presentLocalized(file.changeCondition, locale),
      },
    ],
    catalysts,
    risks,
    coverage: file.coverage,
    analysisRows,
    valuationConclusion,
    nextVerificationEvent: presentLocalized(file.nextEvent, locale),
    comparisonRows,
    scenarios,
    teamRows,
    debates,
    initialView,
    finalView,
    acceptedClaims: positives,
    preservedDissent: concerns,
    evidenceIndex: file.evidenceIndex.map((source) => ({
      ...source,
      ...readerEvidenceLabel(source.publisher, source.title, locale),
    })),
  };
}
