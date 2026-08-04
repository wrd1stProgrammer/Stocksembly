import type { z } from "zod";
import {
  type AtomicEditorialClaimSchema,
  PersistedQuestionAnswerSchema,
  type TeamEditorialDecisionSchema,
} from "../domain/agentOutputsShared";
import { hashCanonical } from "../domain/contractHelpers";
import {
  extractNumericTokens,
  textSimilarity,
} from "../domain/editorialQuality";
import type {
  ResearchMetricPoint,
  ResearchMetricSnapshot,
} from "../domain/metricSnapshot";
import {
  DEFAULT_RESEARCH_PROFILE,
  type ResearchProfile,
} from "../domain/researchProfile";

export const ANTICIPATED_QUESTIONS_POLICY = Object.freeze({
  standardTarget: 10,
  moduleMinimum: 5,
  maximumPerPrimaryClaim: 2,
});

type Claim = z.infer<typeof AtomicEditorialClaimSchema>;
type Decision = z.infer<typeof TeamEditorialDecisionSchema>;
type PersistedQuestion = z.infer<typeof PersistedQuestionAnswerSchema>;

function deterministicQuestionId(key: string): string {
  const digest = hashCanonical(key);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

const DECISION_DIMENSION_LABELS: Readonly<
  Record<string, { readonly en: string; readonly ko: string }>
> = {
  moat: { en: "competitive moat", ko: "경쟁 우위" },
  growth_engine: { en: "growth engine", ko: "성장 엔진" },
  adoption: { en: "customer adoption", ko: "고객 채택" },
  competitive_erosion: { en: "competitive erosion", ko: "경쟁 침식" },
  margin: { en: "margin durability", ko: "마진 지속성" },
  cash_conversion: { en: "cash conversion", ko: "현금 전환" },
  reinvestment: { en: "reinvestment capacity", ko: "재투자 여력" },
  embedded_expectations: {
    en: "priced-in expectations",
    ko: "주가에 반영된 기대",
  },
  relative_performance: { en: "relative performance", ko: "상대 성과" },
  downside_path: { en: "downside path", ko: "하방 경로" },
  leading_indicator: { en: "leading risk indicator", ko: "선행 위험 지표" },
  execution: { en: "execution quality", ko: "실행력" },
  catalyst: { en: "catalyst timing", ko: "촉매 시점" },
  timing: { en: "entry timing", ko: "진입 시점" },
  regime: { en: "market regime", ko: "시장 국면" },
};

function dimensionLabel(dimension: string) {
  return (
    DECISION_DIMENSION_LABELS[dimension] ?? {
      en: dimension.replaceAll("_", " "),
      ko: dimension.replaceAll("_", " "),
    }
  );
}

function questionFor(
  claim: Claim,
  kind: "thesis" | "falsifier",
  variant = 0,
): { readonly en: string; readonly ko: string } {
  const label = dimensionLabel(claim.decisionDimension);
  const investorQuestions: Readonly<
    Record<string, { readonly en: string; readonly ko: string }>
  > = {
    regime: {
      en: "Is this a durable market regime or a stock-specific illusion?",
      ko: "지금 상승은 지속 가능한 시장 국면인가요, 종목만의 착시인가요?",
    },
    timing: {
      en: "Is the entry technically confirmed, or would buying now be chasing?",
      ko: "지금 진입은 기술적으로 확인됐나요, 아니면 추격에 가깝나요?",
    },
    relative_performance: {
      en: "Is the stock genuinely outperforming its sector and closest peer?",
      ko: "지수·섹터·핵심 경쟁사보다 실제로 강한가요?",
    },
    catalyst: {
      en: "Can the next catalyst still move the stock, or is it already priced in?",
      ko: "다음 촉매가 주가를 더 움직일 수 있나요, 이미 반영됐나요?",
    },
    growth_engine: {
      en: "What proves this growth engine is repeatable rather than a one-cycle windfall?",
      ko: "이 성장 엔진이 일회성 호황이 아니라 반복 가능하다는 증거는 무엇인가요?",
    },
    adoption: {
      en: "Are customers proving adoption with production use and spending?",
      ko: "고객이 발표가 아니라 실제 사용과 지출로 채택을 입증하고 있나요?",
    },
    moat: {
      en: "Why can customers not switch to a credible alternative?",
      ko: "고객이 현실적인 대체재로 쉽게 옮기지 못하는 이유는 무엇인가요?",
    },
    competitive_erosion: {
      en: "What is the most credible path for the moat to erode?",
      ko: "경쟁우위를 훼손할 가장 현실적인 경로는 무엇인가요?",
    },
    margin: {
      en: "Are current margins structural, or are they close to a cycle peak?",
      ko: "현재 마진은 구조적인가요, 사이클 정점에 가까운가요?",
    },
    cash_conversion: {
      en: "Does reported profit actually survive as free cash flow?",
      ko: "회계상 이익이 실제 잉여현금흐름으로 남고 있나요?",
    },
    reinvestment: {
      en: "How much capital must be reinvested to keep growth alive?",
      ko: "성장을 유지하려면 앞으로 얼마나 많은 자본을 다시 투입해야 하나요?",
    },
    embedded_expectations: {
      en: "How much execution perfection is embedded in today's price?",
      ko: "현재 가격에는 얼마나 완벽한 실행이 반영돼 있나요?",
    },
    downside_path: {
      en: "What realistic chain of events could drive a 20–30% drawdown?",
      ko: "20~30% 하락을 만들 수 있는 현실적인 사건의 연결고리는 무엇인가요?",
    },
    leading_indicator: {
      en: "Which warning signal can reveal the problem before earnings do?",
      ko: "실적이 꺾이기 전에 문제를 드러낼 선행 신호는 무엇인가요?",
    },
    mitigant: {
      en: "If the downside arrives, what can actually absorb the shock?",
      ko: "하방 위험이 현실화되면 무엇이 실제 충격을 흡수할 수 있나요?",
    },
  };
  if (kind === "thesis" && variant === 0)
    return (
      investorQuestions[claim.decisionDimension] ?? {
        en: `At today's price, what does the ${label.en} thesis require?`,
        ko: `현재 가격에서 ${label.ko} 논지가 요구하는 조건은 무엇인가요?`,
      }
    );
  if (kind === "falsifier") {
    const falsifierQuestions: readonly [Localized, ...Localized[]] = [
      {
        en: `What observable result would invalidate the ${label.en} view?`,
        ko: `어떤 관찰 결과가 나오면 ${label.ko} 판단을 폐기해야 하나요?`,
      },
      {
        en: `Which threshold would prove the ${label.en} reading wrong?`,
        ko: `어떤 임계치가 ${label.ko} 해석이 틀렸음을 보여주나요?`,
      },
      {
        en: `What evidence would reverse the ${label.en} call before the next report?`,
        ko: `다음 리포트 전이라도 ${label.ko} 판단을 뒤집을 근거는 무엇인가요?`,
      },
      {
        en: `Which missing result would break the ${label.en} thesis?`,
        ko: `어떤 결과가 나오지 않으면 ${label.ko} 논지가 깨지나요?`,
      },
      {
        en: `What would make waiting safer than relying on the ${label.en} view?`,
        ko: `${label.ko} 판단에 기대는 것보다 기다리는 편이 나은 조건은 무엇인가요?`,
      },
    ];
    return (
      falsifierQuestions[variant % falsifierQuestions.length] ??
      falsifierQuestions[0]
    );
  }
  const variants: readonly [Localized, ...Localized[]] = [
    {
      en: `Which hard evidence makes the ${label.en} case decision-relevant now?`,
      ko: `${label.ko} 관점에서 지금 판단을 바꿀 만큼 강한 근거는 무엇인가요?`,
    },
    {
      en: `What is the market most likely mispricing about ${label.en}?`,
      ko: `시장이 ${label.ko}에서 가장 잘못 가격에 반영한 것은 무엇인가요?`,
    },
    {
      en: `What part of the ${label.en} case is proven, and what remains fragile?`,
      ko: `${label.ko} 논지에서 확인된 부분과 아직 취약한 부분은 각각 무엇인가요?`,
    },
    {
      en: `If the ${label.en} view is right, what should show up in the next result?`,
      ko: `${label.ko} 판단이 맞다면 다음 결과에서 무엇이 나타나야 하나요?`,
    },
  ];
  return variants[(variant - 1) % variants.length] ?? variants[0];
}

type Localized = { readonly en: string; readonly ko: string };

type QuestionCandidate = {
  readonly decisionKey: string;
  readonly priority: number;
  readonly question: Localized;
  readonly answer: Localized;
  readonly claims: readonly Claim[];
};

function joinLocalized(first: Localized, second: Localized): Localized {
  const join = (locale: "en" | "ko") => {
    const left = first[locale].trim();
    const right = second[locale].trim();
    if (left === right || left.includes(right)) return left;
    if (right.includes(left)) return right;
    return `${left}${/[.!?。！？]$/u.test(left) ? " " : ". "}${right}`;
  };
  return { en: join("en"), ko: join("ko") };
}

function metricValue(metric: ResearchMetricPoint): Localized {
  const format = (locale: "en" | "ko") => {
    const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
    if (metric.unit === "percent")
      return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%`;
    if (metric.unit === "multiple")
      return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}x`;
    if (metric.unit === "USD_per_share")
      return `$${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 2 })}`;
    if (metric.unit === "USD" && Math.abs(metric.value) >= 1_000_000_000)
      return `$${(metric.value / 1_000_000_000).toLocaleString(numberLocale, { maximumFractionDigits: 1 })}B`;
    return metric.value.toLocaleString(numberLocale, {
      maximumFractionDigits: 2,
    });
  };
  return { en: format("en"), ko: format("ko") };
}

function profileImplication(
  profile: ResearchProfile,
  dimension: Claim["decisionDimension"],
): Localized {
  const horizon = {
    short: {
      en: "For a short horizon, the next catalyst and price confirmation carry more weight than distant optionality.",
      ko: "단기 관점에서는 먼 미래의 선택지보다 다음 촉매와 가격 확인이 더 중요합니다.",
    },
    medium: {
      en: "Over the next two to four reporting periods, execution and estimate direction must confirm the thesis.",
      ko: "향후 2~4개 보고 기간에는 실행력과 추정치 방향이 이 논지를 확인해야 합니다.",
    },
    long: {
      en: "For a long horizon, durable demand and reinvestment economics matter more than one quarter's price action.",
      ko: "장기 관점에서는 한 분기의 주가보다 지속 수요와 재투자 경제성이 더 중요합니다.",
    },
  }[profile.investmentHorizon];
  const dimensionImplication: Partial<
    Record<Claim["decisionDimension"], Localized>
  > = {
    embedded_expectations: {
      en: "The decision therefore depends on whether operating delivery can outrun what the valuation already assumes.",
      ko: "따라서 투자 판단은 실제 운영 성과가 현재 밸류에이션에 반영된 기대를 넘어설 수 있는지에 달려 있습니다.",
    },
    downside_path: {
      en: "The relevant risk is the transmission from the first trigger into earnings and multiple compression, not the headline alone.",
      ko: "중요한 위험은 표면적 사건 자체보다 첫 충격이 이익 훼손과 멀티플 축소로 전파되는 경로입니다.",
    },
    cash_conversion: {
      en: "Growth that fails to convert into cash should receive a lower valuation weight.",
      ko: "현금으로 전환되지 않는 성장은 밸류에이션에서 더 낮은 가중치를 받아야 합니다.",
    },
    catalyst: {
      en: "A catalyst matters only when it changes estimates or removes a disputed assumption.",
      ko: "촉매는 추정치를 바꾸거나 논쟁적인 가정을 해소할 때만 투자 가치가 있습니다.",
    },
    relative_performance: {
      en: "Absolute gains are insufficient if the stock cannot beat its selected opportunity set on aligned periods.",
      ko: "같은 기간의 비교 대상보다 강하지 못하다면 절대 수익률만으로는 충분하지 않습니다.",
    },
    moat: {
      en: "The moat deserves a premium only while it protects retention, pricing power, or unit economics.",
      ko: "해자는 유지율·가격 결정력·단위 경제성을 실제로 방어할 때만 프리미엄을 받을 수 있습니다.",
    },
  };
  return dimensionImplication[dimension] ?? horizon;
}

function claimAnswer(
  profile: ResearchProfile,
  claim: Claim,
  variant: number,
): Localized {
  if (variant % 4 === 0)
    return joinLocalized(
      claim.publicThesis,
      profileImplication(profile, claim.decisionDimension),
    );
  if (variant % 4 === 1)
    return joinLocalized(claim.publicThesis, {
      en: `The view loses decision weight if ${claim.falsifier.en}`,
      ko: `다만 다음 조건이 나타나면 이 판단의 가중치를 낮춰야 합니다. ${claim.falsifier.ko}`,
    });
  if (variant % 4 === 2)
    return joinLocalized(claim.publicThesis, {
      en:
        profile.decisionPurpose === "earnings"
          ? "The next release must confirm this mechanism in reported results, not merely in guidance language."
          : "This matters only to the extent that it changes the evidence-to-price trade-off for the stated decision purpose.",
      ko:
        profile.decisionPurpose === "earnings"
          ? "다음 실적에서는 가이던스 문구가 아니라 실제 보고 수치로 이 메커니즘을 확인해야 합니다."
          : "이 근거가 선택한 의사결정 목적에서 근거 대비 가격 조건을 바꿀 때만 투자 의미가 생깁니다.",
    });
  return joinLocalized(claim.publicThesis, {
    en:
      claim.stanceContribution === "opposes"
        ? "This is a reason to demand a wider margin of safety until the contrary evidence weakens."
        : "The claim supports the current direction, but only while its observable falsifier remains absent.",
    ko:
      claim.stanceContribution === "opposes"
        ? "반대 근거가 약해지기 전까지 더 넓은 안전마진을 요구하게 만드는 요인입니다."
        : "현재 판단 방향을 지지하지만, 관찰 가능한 반증 조건이 나타나지 않을 때만 유효합니다.",
  });
}

function falsifierAnswer(claim: Claim, variant: number): Localized {
  const implications: readonly [Localized, ...Localized[]] = [
    {
      en: "Treat this as a precommitted decision rule, not as a caveat added after the price moves.",
      ko: "이는 주가가 움직인 뒤 덧붙이는 단서가 아니라 사전에 정한 판단 규칙으로 사용해야 합니다.",
    },
    {
      en: "The threshold matters because crossing it would contradict the mechanism supporting the claim.",
      ko: "이 임계치는 주장을 지지하는 메커니즘과 직접 충돌하기 때문에 중요합니다.",
    },
    {
      en: "A reversal should occur when this evidence appears, even if the headline narrative remains popular.",
      ko: "표면적 성장 서사가 여전히 인기 있더라도 이 근거가 나타나면 판단을 뒤집어야 합니다.",
    },
    {
      en: "Failure to produce the expected result shifts the burden of proof back to the lead thesis.",
      ko: "예상 결과가 나오지 않으면 핵심 논지가 다시 입증 책임을 져야 합니다.",
    },
    {
      en: "Until this condition is resolved, confidence should not rise merely because the share price does.",
      ko: "이 조건이 해소되기 전에는 주가 상승만으로 판단 신뢰도를 높여서는 안 됩니다.",
    },
  ];
  return joinLocalized(
    claim.falsifier,
    implications[variant % implications.length] ?? implications[0],
  );
}

function claimsFor(
  claims: readonly Claim[],
  dimensions: readonly Claim["decisionDimension"][],
): readonly Claim[] {
  const dimensionSet = new Set(dimensions);
  return claims.filter((claim) => dimensionSet.has(claim.decisionDimension));
}

function evidenceIds(claims: readonly Claim[]): readonly string[] {
  return [...new Set(claims.flatMap((claim) => claim.evidenceArtifactIds))];
}

function calculationCandidates(input: {
  readonly profile: ResearchProfile;
  readonly metrics?: ResearchMetricSnapshot;
  readonly marketSnapshot?: { readonly lastPrice: number };
  readonly claims: readonly Claim[];
}): readonly QuestionCandidate[] {
  const metrics = new Map(
    (input.metrics?.metrics ?? []).map((metric) => [metric.id, metric]),
  );
  const candidates: QuestionCandidate[] = [];
  const linkedClaim = (
    metricIds: readonly string[],
    dimensions: readonly Claim["decisionDimension"][],
  ) =>
    input.claims.find((claim) =>
      claim.decisiveMetricIds.some((metricId) => metricIds.includes(metricId)),
    ) ?? claimsFor(input.claims, dimensions)[0];
  const revenue = metrics.get("revenue_ttm");
  const target = metrics.get("price_target_median");
  const targetClaim = linkedClaim(
    ["price_target_median", "forward_pe", "pe"],
    ["embedded_expectations", "timing"],
  );
  if (
    target !== undefined &&
    input.marketSnapshot !== undefined &&
    input.marketSnapshot.lastPrice > 0 &&
    targetClaim !== undefined
  ) {
    const gap = (target.value / input.marketSnapshot.lastPrice - 1) * 100;
    const direction =
      gap >= 0
        ? { en: "above", ko: "높습니다." }
        : { en: "below", ko: "낮습니다." };
    const gapText = Math.abs(gap).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    });
    candidates.push({
      decisionKey: "consensus_price_gap",
      priority: 109,
      question: {
        en: "How much upside or downside does the consensus target imply from here?",
        ko: "현재가 대비 컨센서스 목표주가는 어느 정도의 상승·하락 여지를 뜻하나요?",
      },
      answer: {
        en: `The median target is ${gapText}% ${direction.en} the current price. That spread is a sentiment reference, not proof of value; ${targetClaim.publicThesis.en}`,
        ko: `컨센서스 중앙값은 현재가보다 ${gapText}% ${direction.ko} 이 격차는 가치의 증명이 아니라 기대의 기준점입니다. ${targetClaim.publicThesis.ko}`,
      },
      claims: [targetClaim],
    });
  }
  const forwardEps = metrics.get("forward_eps");
  const earningsClaim = linkedClaim(
    ["forward_eps", "forward_pe"],
    ["embedded_expectations", "margin", "growth_engine"],
  );
  if (
    forwardEps !== undefined &&
    input.marketSnapshot !== undefined &&
    input.marketSnapshot.lastPrice > 0 &&
    forwardEps.value > 0 &&
    earningsClaim !== undefined
  ) {
    const impliedForwardPe = input.marketSnapshot.lastPrice / forwardEps.value;
    const price = input.marketSnapshot.lastPrice.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
    const eps = forwardEps.value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
    const multiple = impliedForwardPe.toLocaleString("en-US", {
      maximumFractionDigits: 1,
    });
    candidates.push({
      decisionKey: "implied_forward_earnings_multiple",
      priority: input.profile.decisionPurpose === "earnings" ? 109.5 : 101,
      question: {
        en: "What earnings multiple does the current price place on forward consensus EPS?",
        ko: "현재가는 선행 컨센서스 EPS에 몇 배의 이익 배수를 부여하고 있나요?",
      },
      answer: {
        en: `At $${price} and forward EPS of $${eps}, the price implies about ${multiple}x forward earnings. ${earningsClaim.publicThesis.en} The next release must justify that multiple through estimate revisions or durable margins, not merely an earnings beat.`,
        ko: `현재가 $${price}와 선행 EPS $${eps}를 적용하면 약 ${multiple}배의 선행 이익 배수가 계산됩니다. ${earningsClaim.publicThesis.ko} 다음 실적은 단순한 어닝 서프라이즈가 아니라 추정치 상향이나 지속 가능한 마진으로 이 배수를 정당화해야 합니다.`,
      },
      claims: [earningsClaim],
    });
  }
  const forwardRevenue = metrics.get("forward_revenue");
  const revenueClaim = linkedClaim(
    ["forward_revenue", "revenue_ttm", "revenue_growth"],
    ["growth_engine", "adoption", "embedded_expectations"],
  );
  if (
    forwardRevenue !== undefined &&
    revenue !== undefined &&
    revenue.value > 0 &&
    revenueClaim !== undefined
  ) {
    const impliedGrowth = (forwardRevenue.value / revenue.value - 1) * 100;
    const growthText = impliedGrowth.toLocaleString("en-US", {
      maximumFractionDigits: 1,
      signDisplay: "always",
    });
    candidates.push({
      decisionKey: "forward_revenue_expectation",
      priority: input.profile.decisionPurpose === "earnings" ? 107 : 99,
      question: {
        en: "What revenue growth is embedded in the next-twelve-month consensus?",
        ko: "향후 12개월 컨센서스에는 어느 정도의 매출 성장이 반영돼 있나요?",
      },
      answer: {
        en: `Forward revenue is ${growthText}% versus trailing revenue. ${revenueClaim.publicThesis.en} The earnings decision should focus on whether guidance lifts this growth path without sacrificing operating quality.`,
        ko: `선행 매출 전망은 최근 12개월 매출보다 ${growthText}% 높습니다. ${revenueClaim.publicThesis.ko} 실적 판단에서는 가이던스가 운영의 질을 훼손하지 않으면서 이 성장 경로를 높이는지 확인해야 합니다.`,
      },
      claims: [revenueClaim],
    });
  }
  const freeCashFlow = metrics.get("free_cash_flow");
  const cashClaim = linkedClaim(
    ["free_cash_flow", "revenue_ttm"],
    ["cash_conversion", "margin"],
  );
  if (
    revenue !== undefined &&
    freeCashFlow !== undefined &&
    revenue.value > 0 &&
    cashClaim !== undefined
  ) {
    const margin = (freeCashFlow.value / revenue.value) * 100;
    const marginText = margin.toLocaleString("en-US", {
      maximumFractionDigits: 1,
    });
    candidates.push({
      decisionKey: "free_cash_flow_conversion",
      priority: 104,
      question: {
        en: "What share of revenue is actually surviving as free cash flow?",
        ko: "매출 중 실제 잉여현금흐름으로 남는 비중은 얼마나 되나요?",
      },
      answer: {
        en: `Free cash flow equals ${marginText}% of trailing revenue. ${cashClaim.publicThesis.en} The conversion rate is the harder test of earnings quality than reported growth alone.`,
        ko: `잉여현금흐름은 최근 12개월 매출의 ${marginText}%입니다. ${cashClaim.publicThesis.ko} 보고 성장률보다 이 전환율이 이익의 질을 더 엄격하게 보여줍니다.`,
      },
      claims: [cashClaim],
    });
  }
  const capex = metrics.get("capital_expenditures");
  const reinvestmentClaim = linkedClaim(
    ["capital_expenditures", "revenue_ttm"],
    ["reinvestment", "cash_conversion"],
  );
  if (
    revenue !== undefined &&
    capex !== undefined &&
    revenue.value > 0 &&
    reinvestmentClaim !== undefined
  ) {
    const intensity = (Math.abs(capex.value) / revenue.value) * 100;
    const intensityText = intensity.toLocaleString("en-US", {
      maximumFractionDigits: 1,
    });
    candidates.push({
      decisionKey: "capital_intensity",
      priority: 98,
      question: {
        en: "How capital-intensive is the current growth engine?",
        ko: "현재 성장 엔진은 매출 대비 얼마나 많은 자본을 요구하나요?",
      },
      answer: {
        en: `Capital expenditure equals ${intensityText}% of trailing revenue. ${reinvestmentClaim.publicThesis.en} The investment case weakens if this burden rises without a matching improvement in growth or cash generation.`,
        ko: `설비투자는 최근 12개월 매출의 ${intensityText}%입니다. ${reinvestmentClaim.publicThesis.ko} 성장이나 현금 창출 개선 없이 이 부담만 커지면 투자 논지는 약해집니다.`,
      },
      claims: [reinvestmentClaim],
    });
  }
  const relativeMetric = [...metrics.values()].find((metric) =>
    metric.id.startsWith("peer_premium:"),
  );
  const relativeClaim = linkedClaim(
    relativeMetric === undefined ? [] : [relativeMetric.id],
    ["embedded_expectations", "relative_performance"],
  );
  if (relativeMetric !== undefined && relativeClaim !== undefined) {
    const value = metricValue(relativeMetric);
    candidates.push({
      decisionKey: "qualified_peer_premium",
      priority: input.profile.comparisonSymbols.length > 0 ? 107 : 86,
      question: {
        en: "What premium or discount is the stock carrying versus qualified peers?",
        ko: "검증된 비교기업 대비 현재 주가는 어느 정도 프리미엄·할인을 받고 있나요?",
      },
      answer: {
        en: `The aligned peer comparison shows ${value.en}. ${relativeClaim.publicThesis.en} A premium is earned only if the operating advantage persists over the selected horizon.`,
        ko: `기간을 맞춘 비교 결과는 ${value.ko}를 가리킵니다. ${relativeClaim.publicThesis.ko} 프리미엄은 선택한 투자 기간 동안 운영 우위가 지속될 때만 정당화됩니다.`,
      },
      claims: [relativeClaim],
    });
  }
  const buyRecommendations = metrics.get("recommendation_buy");
  const holdRecommendations = metrics.get("recommendation_hold");
  const sellRecommendations = metrics.get("recommendation_sell");
  const consensusClaim = linkedClaim(
    ["recommendation_buy", "recommendation_hold", "recommendation_sell"],
    ["embedded_expectations", "downside_path"],
  );
  if (
    buyRecommendations !== undefined &&
    holdRecommendations !== undefined &&
    sellRecommendations !== undefined &&
    consensusClaim !== undefined
  ) {
    const total =
      buyRecommendations.value +
      holdRecommendations.value +
      sellRecommendations.value;
    if (total > 0) {
      const bullishShare = (buyRecommendations.value / total) * 100;
      const bullishText = bullishShare.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
      candidates.push({
        decisionKey: "consensus_positioning",
        priority:
          input.profile.counterargumentIntensity === "strong" ? 105 : 94,
        question: {
          en: "How crowded is the positive analyst view, and what does that imply for surprise risk?",
          ko: "긍정적 애널리스트 시각은 얼마나 쏠려 있으며, 이는 서프라이즈 위험에 무엇을 뜻하나요?",
        },
        answer: {
          en: `${bullishText}% of ${total} tracked recommendations are buys (${buyRecommendations.value} buy, ${holdRecommendations.value} hold, ${sellRecommendations.value} sell). ${consensusClaim.publicThesis.en} A crowded positive view raises the bar for upside surprise and increases sensitivity to even a modest estimate cut.`,
          ko: `추적된 ${total}개 의견 중 매수는 ${bullishText}%입니다(매수 ${buyRecommendations.value}, 중립 ${holdRecommendations.value}, 매도 ${sellRecommendations.value}). ${consensusClaim.publicThesis.ko} 긍정 의견이 몰릴수록 추가 상승을 위한 서프라이즈 기준은 높아지고 작은 추정치 하향에도 민감해집니다.`,
        },
        claims: [consensusClaim],
      });
    }
  }
  return candidates;
}

function purposeQuestion(profile: ResearchProfile): Localized {
  return {
    new_entry: {
      en: "What must be true before a new position has a favorable evidence-to-price trade-off?",
      ko: "신규 진입의 근거 대비 가격 조건이 유리하려면 무엇이 먼저 확인돼야 하나요?",
    },
    holding_review: {
      en: "Is the holding thesis intact, weakened, or broken?",
      ko: "보유 논지는 유지·약화·훼손 중 어디에 해당하나요?",
    },
    position_sizing: {
      en: "Which evidence argues for more exposure, and which evidence argues for less?",
      ko: "비중 확대와 축소를 각각 뒷받침하는 근거는 무엇인가요?",
    },
    earnings: {
      en: "What must the next earnings release prove to change the decision?",
      ko: "다음 실적이 무엇을 입증해야 현재 판단이 달라지나요?",
    },
  }[profile.decisionPurpose];
}

/** Selects only answerable questions; it never pads a sparse report. */
export function selectGroundedAnticipatedQuestions(
  input: Readonly<{
    runId: string;
    decision: Decision;
    claims: readonly Claim[];
    researchProfile?: ResearchProfile;
    metricSnapshot?: ResearchMetricSnapshot;
    marketSnapshot?: { readonly lastPrice: number };
    target?: number;
  }>,
): Readonly<{
  policy: typeof ANTICIPATED_QUESTIONS_POLICY;
  supportedCount: number;
  moduleVisible: boolean;
  questions: readonly PersistedQuestion[];
  supportedNumbers: readonly string[];
}> {
  const profile = input.researchProfile ?? DEFAULT_RESEARCH_PROFILE;
  const target = Math.min(
    ANTICIPATED_QUESTIONS_POLICY.standardTarget,
    Math.max(0, input.target ?? ANTICIPATED_QUESTIONS_POLICY.standardTarget),
  );
  const preferred = [
    ...input.decision.primaryClaimIds.flatMap((claimId) =>
      input.claims.filter((claim) => claim.claimId === claimId),
    ),
    ...input.claims.filter(
      (claim) => !input.decision.primaryClaimIds.includes(claim.claimId),
    ),
  ];
  const primaryClaims = preferred.filter((claim) =>
    input.decision.primaryClaimIds.includes(claim.claimId),
  );
  const counterClaims = preferred.filter(
    (claim) => claim.stanceContribution !== "supports",
  );
  const decisionClaims =
    primaryClaims.length > 0 ? primaryClaims : preferred.slice(0, 1);
  const decisionAnswer = joinLocalized(input.decision.decisiveReason, {
    en: `The strongest opposing case is: ${input.decision.strongestCountercase.en}`,
    ko: `가장 강한 반대 논거는 다음과 같습니다. ${input.decision.strongestCountercase.ko}`,
  });
  const candidates: QuestionCandidate[] = [
    {
      decisionKey: `decision_${profile.decisionPurpose}`,
      priority: 110,
      question: purposeQuestion(profile),
      answer: decisionAnswer,
      claims: decisionClaims,
    },
    {
      decisionKey: "decision_breaker",
      priority: 106,
      question: {
        en: "What single observable result would force the current decision to change?",
        ko: "어떤 단 하나의 관찰 결과가 나오면 현재 판단을 바꿔야 하나요?",
      },
      answer: joinLocalized(input.decision.falsifier, {
        en: "That result matters because it attacks the decisive premise rather than a secondary data point.",
        ko: "이 결과는 보조 지표가 아니라 현재 판단의 핵심 전제를 직접 훼손하기 때문에 중요합니다.",
      }),
      claims: decisionClaims,
    },
    {
      decisionKey: "strongest_countercase",
      priority: profile.counterargumentIntensity === "strong" ? 108 : 92,
      question: {
        en: "What is the strongest case against the current conclusion?",
        ko: "현재 결론에 맞서는 가장 강한 반대 논거는 무엇인가요?",
      },
      answer: joinLocalized(input.decision.strongestCountercase, {
        en: "The decision should be downgraded if this countercase begins to explain the operating data better than the lead thesis.",
        ko: "이 반대 논리가 핵심 논지보다 실제 운영 데이터를 더 잘 설명하기 시작하면 현재 판단의 강도를 낮춰야 합니다.",
      }),
      claims:
        counterClaims.length > 0 ? counterClaims.slice(0, 2) : decisionClaims,
    },
    ...preferred.map(
      (claim, index): QuestionCandidate => ({
        decisionKey: `${claim.decisionDimension}_decision_${index + 1}`,
        priority:
          88 +
          (claim.materiality === "material" ? 5 : 0) +
          (input.decision.primaryClaimIds.includes(claim.claimId) ? 4 : 0),
        question: questionFor(claim, "thesis", index % 5),
        answer: claimAnswer(profile, claim, index),
        claims: [claim],
      }),
    ),
    ...calculationCandidates({
      profile,
      ...(input.metricSnapshot === undefined
        ? {}
        : { metrics: input.metricSnapshot }),
      ...(input.marketSnapshot === undefined
        ? {}
        : { marketSnapshot: input.marketSnapshot }),
      claims: preferred,
    }),
    ...preferred
      .filter((claim) => claim.materiality === "material")
      .map(
        (claim, index): QuestionCandidate => ({
          decisionKey: `${claim.decisionDimension}_falsifier_${index + 1}`,
          priority: 76,
          question: questionFor(claim, "falsifier", index),
          answer: falsifierAnswer(claim, index),
          claims: [claim],
        }),
      ),
  ].sort((left, right) => right.priority - left.priority);
  const selected: PersistedQuestion[] = [];
  const primaryCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (selected.length >= target || candidate.claims.length === 0) break;
    if (
      candidate.claims.some((claim) => claim.evidenceArtifactIds.length === 0)
    )
      continue;
    if (
      candidate.claims.some(
        (claim) =>
          (primaryCounts.get(claim.claimId) ?? 0) >=
          ANTICIPATED_QUESTIONS_POLICY.maximumPerPrimaryClaim,
      )
    )
      continue;
    const calculatedCandidate =
      /(?:consensus_price_gap|implied_forward_earnings_multiple|forward_revenue_expectation|free_cash_flow_conversion|capital_intensity|qualified_peer_premium|consensus_positioning)/u.test(
        candidate.decisionKey,
      );
    if (
      selected.some(
        (question) =>
          textSimilarity(question.question.en, candidate.question.en, "en")
            .duplicate ||
          textSimilarity(question.question.ko, candidate.question.ko, "ko")
            .duplicate ||
          (!calculatedCandidate &&
            (textSimilarity(question.answer.en, candidate.answer.en, "en")
              .duplicate ||
              textSimilarity(question.answer.ko, candidate.answer.ko, "ko")
                .duplicate)),
      )
    )
      continue;
    for (const claim of candidate.claims)
      primaryCounts.set(
        claim.claimId,
        (primaryCounts.get(claim.claimId) ?? 0) + 1,
      );
    const primaryClaimIds = candidate.claims.map((claim) => claim.claimId);
    selected.push(
      PersistedQuestionAnswerSchema.parse({
        questionId: deterministicQuestionId(
          `${input.runId}:${candidate.decisionKey}:${primaryClaimIds.join(",")}`,
        ),
        decisionKey: candidate.decisionKey,
        question: candidate.question,
        answer: candidate.answer,
        primaryClaimIds,
        evidenceArtifactIds: evidenceIds(candidate.claims),
        rank: selected.length + 1,
      }),
    );
  }
  return {
    policy: ANTICIPATED_QUESTIONS_POLICY,
    supportedCount: selected.length,
    moduleVisible:
      selected.length >= ANTICIPATED_QUESTIONS_POLICY.moduleMinimum,
    questions: selected,
    supportedNumbers: [
      ...new Set(
        selected.flatMap((question) => [
          ...extractNumericTokens(question.answer.en),
          ...extractNumericTokens(question.answer.ko),
        ]),
      ),
    ],
  };
}
