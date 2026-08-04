import Image from "next/image";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type {
  EditorialDecisionPath,
  EditorialVisualMetric,
  ResearchFileEditorialModel,
} from "../../../research/researchFileEditorialModel";
import { buildCommitteeDecisionModel } from "./committeeDecisionModel";
import { EvidenceStrength } from "./ResearchFilePrimitives";
import { ResearchDecisionPathBoard } from "./ResearchFileVisuals";

const voteLabels = {
  support: { en: "Support", ko: "지지" },
  support_with_reservations: { en: "Qualified", ko: "조건부" },
  oppose: { en: "Oppose", ko: "반대" },
  abstain: { en: "Abstain", ko: "유보" },
} as const;

const dimensionLabels: Readonly<Record<string, { en: string; ko: string }>> = {
  growth_engine: { en: "Growth engine", ko: "성장 엔진" },
  relative_performance: { en: "Market position", ko: "시장 위치" },
  valuation: { en: "Valuation", ko: "밸류에이션" },
  cash_conversion: { en: "Cash conversion", ko: "현금 전환" },
  margin_durability: { en: "Margin durability", ko: "마진 지속성" },
  moat: { en: "Competitive edge", ko: "경쟁 우위" },
  downside_path: { en: "Downside path", ko: "하방 경로" },
  leading_indicator: { en: "Leading indicator", ko: "선행 지표" },
  catalyst: { en: "Catalyst", ko: "촉매" },
  adoption: { en: "Adoption", ko: "채택·확산" },
  margin: { en: "Margin", ko: "수익성" },
  regime: { en: "Market regime", ko: "시장 국면" },
  competition: { en: "Competition", ko: "경쟁 구도" },
};

function dimensionLabel(value: string, locale: Locale): string {
  return dimensionLabels[value]?.[locale] ?? value.replaceAll("_", " ");
}

function editorialTextKey(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function looksLikeInternalIds(value: string): boolean {
  return /^[\da-f-]{20,}(?:\s*,\s*[\da-f-]{20,})*$/iu.test(value.trim());
}

function departmentForRole(
  roleId: string | undefined,
): "market" | "company" | "financial" | "risk" | undefined {
  if (roleId === undefined) return undefined;
  if (["market", "market_news", "benchmark"].includes(roleId)) return "market";
  if (["company", "company_product", "company_competition"].includes(roleId))
    return "company";
  if (["financial", "valuation", "financial_quality"].includes(roleId))
    return "financial";
  if (["risk", "risk_policy"].includes(roleId)) return "risk";
  return undefined;
}

function metricWithId(
  metrics: readonly EditorialVisualMetric[],
  ...ids: readonly string[]
): EditorialVisualMetric | undefined {
  return ids
    .flatMap((id) =>
      metrics.filter(
        (metric) => metric.id === id || metric.id.startsWith(`${id}:`),
      ),
    )
    .at(0);
}

const metricDescriptions = {
  current_price: {
    en: "Latest traded price available at the report cutoff.",
    ko: "리포트 기준 시각에 확인된 가장 최근 거래 가격입니다.",
  },
  price_target_median: {
    en: "Median analyst target supplied by the data provider; it is not a guaranteed value.",
    ko: "데이터 제공사가 집계한 애널리스트 목표주가 중앙값이며 보장된 가격은 아닙니다.",
  },
  consensus_upside: {
    en: "Percentage gap between the consensus target and the current price.",
    ko: "컨센서스 목표주가와 현재가의 차이를 현재가 대비 백분율로 계산한 값입니다.",
  },
  pe: {
    en: "Current share price divided by trailing earnings per share.",
    ko: "현재 주가를 최근 12개월 주당순이익으로 나눈 주가수익비율입니다.",
  },
  forward_pe: {
    en: "Current share price divided by forecast earnings per share.",
    ko: "현재 주가를 예상 주당순이익으로 나눈 선행 주가수익비율입니다.",
  },
  ev_ebitda: {
    en: "Enterprise value divided by EBITDA; useful for comparing capital structures.",
    ko: "기업가치를 EBITDA로 나눈 값으로 자본구조가 다른 기업 비교에 활용합니다.",
  },
  revenue_growth: {
    en: "Year-over-year growth in trailing twelve-month revenue.",
    ko: "최근 12개월 매출이 전년 같은 기간보다 얼마나 증가했는지 보여줍니다.",
  },
  revenue_ttm: {
    en: "Revenue generated during the latest trailing twelve months.",
    ko: "가장 최근 12개월 동안 발생한 누적 매출입니다.",
  },
  market_cap: {
    en: "Equity market value based on the share price and basic shares outstanding.",
    ko: "주가와 기본 발행주식 수를 기준으로 계산한 회사의 주식시장 가치입니다.",
  },
  gross_margin: {
    en: "Gross profit as a percentage of revenue.",
    ko: "매출에서 매출원가를 제외한 매출총이익이 차지하는 비율입니다.",
  },
  operating_margin: {
    en: "Operating income as a percentage of revenue.",
    ko: "매출에서 영업이익이 차지하는 비율로 본업의 수익성을 나타냅니다.",
  },
  roe: {
    en: "Net income generated relative to shareholders' equity.",
    ko: "주주가 투입한 자기자본 대비 순이익 창출 수준을 나타냅니다.",
  },
  roic: {
    en: "Operating return generated relative to invested capital.",
    ko: "사업에 투입된 자본 대비 영업 수익 창출 효율을 나타냅니다.",
  },
  free_cash_flow: {
    en: "Cash remaining after operating cash flow funds capital expenditure.",
    ko: "영업현금흐름에서 설비투자를 제외하고 남은 현금입니다.",
  },
} as const;

function metricDescription(id: string, locale: Locale): string | undefined {
  const key = Object.keys(metricDescriptions).find(
    (candidate) => id === candidate || id.startsWith(`${candidate}:`),
  ) as keyof typeof metricDescriptions | undefined;
  return key === undefined ? undefined : metricDescriptions[key][locale];
}

export function CommitteeDecisionCockpit({
  file,
  model,
  locale,
}: {
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
}) {
  const view = buildCommitteeDecisionModel(file, model, locale);
  if (view === undefined) return null;
  const ko = locale === "ko";
  const hasValuationData =
    model.metricGroups.expectations.length > 0 ||
    model.metricGroups.financial.length > 0 ||
    view.valuationRows.length > 0 ||
    view.valuationConclusion.length > 0;
  const consensusForecastMetrics = model.metricGroups.expectations
    .filter((metric) => !metric.id.startsWith("recommendation_"))
    .slice(0, 4);
  const priceClaim = file.structuredEditorial?.claims.find((claim) =>
    ["embedded_expectations", "valuation", "margin"].includes(
      claim.decisionDimension,
    ),
  );
  const decisionFalsifier =
    /^(?:Reassess if official evidence no longer|공식 근거가 .*더 이상)/iu.test(
      view.falsifier.trim(),
    )
      ? (view.drivers[2]?.falsifier ??
        view.drivers[1]?.falsifier ??
        view.drivers[0]?.falsifier ??
        view.falsifier)
      : view.falsifier;
  const committeeDecisionPaths: readonly EditorialDecisionPath[] = [
    {
      id: "hold",
      label: ko ? "현재 판단" : "Current view",
      headline: view.stanceLabel,
      detail: view.decisiveReason,
    },
    {
      id: "challenge",
      label: ko ? "핵심 반론" : "Pressure point",
      headline: view.countercase,
      detail:
        view.nextEvent === undefined
          ? (view.drivers[1]?.falsifier ??
            (model.nextVerificationEvent.trim() ||
              (ko
                ? "다음 확인 조건을 설정하지 못했습니다."
                : "No next check is set.")))
          : `${view.nextEvent.date ?? ""} ${view.nextEvent.label}`.trim(),
    },
    {
      id: "invalidate",
      label: ko ? "판단 무효화" : "Invalidation",
      headline: view.drivers[0]?.falsifier ?? decisionFalsifier,
      detail: decisionFalsifier,
    },
  ];
  const expectationLenses = [
    {
      id: "priced",
      label: ko ? "컨센서스가 요구하는 숫자" : "Numbers priced in",
      value: model.metricGroups.expectations
        .slice(0, 3)
        .map((metric) => `${metric.label} ${metric.value}`)
        .join(" · "),
    },
    {
      id: "delivery",
      label: ko ? "실적이 증명해야 할 숫자" : "Operating proof required",
      value: model.metricGroups.financial
        .slice(0, 3)
        .map((metric) => `${metric.label} ${metric.value}`)
        .join(" · "),
    },
    {
      id: "next-proof",
      label: ko ? "다음 공시에서 확인할 것" : "Proof due at the next filing",
      value:
        priceClaim?.falsifier[locale] ??
        model.analysisRows.find((row) => row.checkpoint.trim().length > 0)
          ?.checkpoint ??
        model.nextVerificationEvent,
    },
  ].filter((item) => item.value.trim().length > 0);
  const coreAnalysisKeys = new Set(
    [
      ...view.drivers.map((driver) => driver.thesis),
      ...model.analysisRows
        .slice(0, 4)
        .flatMap((row) => [row.agentView, row.evidence]),
    ]
      .map(editorialTextKey)
      .filter((value) => value.length > 0),
  );
  const uniqueOwnedAnalysis = view.ownedAnalysis.filter(
    (item) => !coreAnalysisKeys.has(editorialTextKey(item.thesis)),
  );
  const metricPool = Object.values(model.metricGroups)
    .flat()
    .filter(
      (metric, index, metrics) =>
        metrics.findIndex((candidate) => candidate.id === metric.id) === index,
    );
  const rawMetric = (...ids: readonly string[]) =>
    file.metricSnapshot?.metrics.find((metric) =>
      ids.some((id) => metric.id === id || metric.id.startsWith(`${id}:`)),
    );
  const recommendationBreakdown = [
    {
      id: "buy",
      label: ko ? "매수" : "Buy",
      count: rawMetric("recommendation_buy")?.value ?? 0,
    },
    {
      id: "hold",
      label: ko ? "중립" : "Hold",
      count: rawMetric("recommendation_hold")?.value ?? 0,
    },
    {
      id: "sell",
      label: ko ? "매도" : "Sell",
      count: rawMetric("recommendation_sell")?.value ?? 0,
    },
  ] as const;
  const recommendationTotal = recommendationBreakdown.reduce(
    (total, item) => total + item.count,
    0,
  );
  const recommendationPercent = (count: number) =>
    recommendationTotal === 0 ? 0 : (count / recommendationTotal) * 100;
  const buyRecommendationPercent = Math.round(
    recommendationPercent(recommendationBreakdown[0].count),
  );
  const currentPrice = rawMetric("current_price")?.value;
  const targetPrice = rawMetric("price_target_median")?.value;
  const upsidePercent =
    currentPrice === undefined || targetPrice === undefined || currentPrice <= 0
      ? undefined
      : ((targetPrice - currentPrice) / currentPrice) * 100;
  const upsideLabel =
    upsidePercent === undefined
      ? undefined
      : `${upsidePercent > 0 ? "+" : ""}${new Intl.NumberFormat(
          ko ? "ko-KR" : "en-US",
          { maximumFractionDigits: 1 },
        ).format(upsidePercent)}%`;
  const keyMetricCandidates: readonly (EditorialVisualMetric | undefined)[] = [
    metricWithId(metricPool, "current_price"),
    metricWithId(metricPool, "price_target_median"),
    upsideLabel === undefined
      ? undefined
      : {
          id: "consensus_upside",
          label: ko ? "컨센서스 상승여력" : "Consensus upside",
          value: upsideLabel,
          category: "expectations",
          signal:
            upsidePercent !== undefined && upsidePercent >= 0
              ? "higher_better"
              : "lower_better",
        },
    metricWithId(metricPool, "pe"),
    metricWithId(metricPool, "forward_pe"),
    metricWithId(metricPool, "ev_ebitda"),
    metricWithId(metricPool, "revenue_growth"),
    metricWithId(metricPool, "revenue_ttm"),
    metricWithId(metricPool, "market_cap"),
    metricWithId(metricPool, "gross_margin"),
    metricWithId(metricPool, "operating_margin"),
    metricWithId(metricPool, "roe"),
    metricWithId(metricPool, "roic"),
    metricWithId(metricPool, "free_cash_flow"),
  ];
  const keyMetrics = keyMetricCandidates.filter(
    (metric): metric is EditorialVisualMetric => metric !== undefined,
  );
  return (
    <>
      <section
        className="committee-cockpit"
        data-committee-cockpit
        data-report-section="decision"
        id="decision-brief"
        aria-labelledby="committee-cockpit-title"
      >
        <header className="committee-cockpit__verdict">
          <div>
            <small className="committee-cockpit__chapter">01</small>
            <span>{ko ? "위원회 판단" : "Committee view"}</span>
            <h2 id="committee-cockpit-title" data-cockpit-view>
              {view.stanceLabel}
            </h2>
          </div>
          <dl>
            <div data-cockpit-confidence>
              <dt>{ko ? "판단 확신도" : "Decision confidence"}</dt>
              <dd data-confidence={view.confidence}>{view.confidenceLabel}</dd>
            </div>
            <div className="committee-cockpit__reliability">
              <dt>{ko ? "근거 신뢰도" : "Evidence reliability"}</dt>
              <dd>{view.reliability}</dd>
            </div>
            {view.price === undefined ? null : (
              <div data-cockpit-price>
                <dt>{ko ? "현재가" : "Current price"}</dt>
                <dd>
                  {view.price.value}
                  {view.price.change === undefined ? null : (
                    <small>{view.price.change}</small>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </header>
        <div className="committee-cockpit__brief">
          <article className="committee-cockpit__opinion">
            <header className="committee-cockpit__section-heading">
              <i aria-hidden="true" />
              <span>{ko ? "투자 의견" : "Investment view"}</span>
            </header>
            <p className="committee-cockpit__opinion-lead">
              {view.decisiveReason}
            </p>
            <div className="committee-cockpit__countercase">
              <strong>{ko ? "가장 강한 반론" : "Strongest countercase"}</strong>
              <p>{view.countercase}</p>
            </div>

            <header className="committee-cockpit__drivers-intro">
              <i aria-hidden="true" />
              <span>{ko ? "핵심 논거" : "Key arguments"}</span>
            </header>
            <ol
              className="committee-cockpit__drivers"
              aria-label={ko ? "순위별 결정 동인" : "Ranked decision drivers"}
            >
              {view.drivers.map((driver) => (
                <li
                  key={driver.id}
                  data-decision-driver
                  data-driver-claim-id={driver.id}
                  data-driver-department={driver.departmentId}
                  data-driver-dimension={driver.decisionDimension}
                  data-driver-materiality={driver.materiality}
                  data-driver-disposition={driver.sourceLineage.disposition}
                  data-driver-origin-claim-id={
                    driver.sourceLineage.originClaimId
                  }
                  data-driver-source-ids={driver.sourceLineage.evidenceArtifactIds.join(
                    ",",
                  )}
                >
                  <b>{String(driver.rank).padStart(2, "0")}</b>
                  <div>
                    <strong>
                      {dimensionLabel(driver.decisionDimension, locale)}
                    </strong>
                    <p>{driver.thesis}</p>
                  </div>
                  <footer>
                    <em>{driver.contribution}</em>
                  </footer>
                </li>
              ))}
            </ol>
          </article>

          <aside className="committee-cockpit__snapshot">
            {keyMetrics.length === 0 ? null : (
              <section className="committee-cockpit__key-metrics">
                <header>{ko ? "주요 지표" : "Key metrics"}</header>
                <dl>
                  {keyMetrics.map((metric) => (
                    <div key={metric.id}>
                      <dt>
                        <span className="committee-cockpit__metric-help">
                          {metric.label}
                          <i aria-hidden="true">?</i>
                          {metricDescription(metric.id, locale) ===
                          undefined ? null : (
                            <small role="tooltip">
                              {metricDescription(metric.id, locale)}
                            </small>
                          )}
                        </span>
                      </dt>
                      <dd data-signal={metric.signal}>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </aside>
        </div>
        <ResearchDecisionPathBoard
          paths={committeeDecisionPaths}
          locale={locale}
        />
      </section>

      <section
        className="committee-owned-analysis committee-evidence-read research-editorial-section"
        data-report-section="evidence-read"
        id="evidence-analysis"
      >
        <header>
          <span>02</span>
          <div>
            <h2>{ko ? "투자 논지 검증" : "Investment case checks"}</h2>
            <p>
              {ko
                ? "주장 → 관찰 근거 → 반론 → 다음 확인 순서로 논지의 강도와 빈틈을 검증합니다."
                : "Audit each claim through observed evidence, the strongest counterpoint, and the next proof required."}
            </p>
          </div>
        </header>
        <div className="committee-claim-ledger">
          {model.analysisRows.length === 0 ? (
            <div className="committee-section-empty">
              <strong>
                {ko
                  ? "핵심 서술형 근거 없음"
                  : "No separate narrative evidence"}
              </strong>
              <p>
                {ko
                  ? "핵심 근거는 위원회 판단 카드와 팀 판정에 통합되어 있습니다."
                  : "The evidence is represented in the committee drivers and team adjudication above."}
              </p>
            </div>
          ) : (
            model.analysisRows.slice(0, 4).map((item, index) => {
              const structuredClaim = file.structuredEditorial?.claims.find(
                (claim) => claim.claimId === item.id,
              );
              const driver = view.drivers.find(
                (candidate) => candidate.id === item.id,
              );
              const department =
                driver?.departmentId ??
                departmentForRole(structuredClaim?.roleOwner);
              const teamRead = view.adjudicationRows.find(
                (row) => row.departmentId === department,
              );
              const allMetrics = Object.values(model.metricGroups).flat();
              const dimensionKey = item.title
                .trim()
                .toLowerCase()
                .replaceAll(" ", "_");
              const preferredMetricPatterns: readonly RegExp[] =
                dimensionKey === "relative_performance"
                  ? [
                      /current_price|현재가|observed_price/iu,
                      /change|전일/iu,
                      /3_month|3개월/iu,
                    ]
                  : dimensionKey === "growth_engine"
                    ? [
                        /revenue_growth|매출_성장|매출 성장/iu,
                        /revenue_ttm|최근_12개월_매출|최근 12개월 매출/iu,
                        /services.*share|services.*비중/iu,
                      ]
                    : dimensionKey === "moat"
                      ? [
                          /services.*share|services.*비중/iu,
                          /gross_margin|매출총이익률/iu,
                          /operating_margin|영업이익률/iu,
                        ]
                      : dimensionKey === "adoption"
                        ? [
                            /iphone.*share|iphone.*비중/iu,
                            /services.*share|services.*비중/iu,
                            /revenue_growth|매출_성장|매출 성장/iu,
                          ]
                        : [];
              const preferredMetrics = preferredMetricPatterns.flatMap(
                (pattern) => {
                  const metric = allMetrics.find((candidate) =>
                    pattern.test(`${candidate.id} ${candidate.label}`),
                  );
                  return metric === undefined ? [] : [metric];
                },
              );
              const decisiveMetrics =
                structuredClaim?.decisiveMetricIds.flatMap((metricId) => {
                  const metric = allMetrics.find(
                    (candidate) =>
                      candidate.id === metricId ||
                      candidate.id.startsWith(`${metricId}:`),
                  );
                  return metric === undefined ? [] : [metric];
                }) ?? [];
              const supportingMetrics =
                preferredMetrics.length > 0
                  ? preferredMetrics
                  : decisiveMetrics.length > 0
                    ? decisiveMetrics
                    : department === undefined
                      ? []
                      : model.metricGroups[department].slice(0, 3);
              const metricEvidence = supportingMetrics
                .slice(0, 3)
                .map((metric) => `${metric.label} ${metric.value}`)
                .join(" · ");
              const repeatedEvidence =
                editorialTextKey(item.evidence) ===
                editorialTextKey(item.agentView);
              const observedEvidence = repeatedEvidence
                ? metricEvidence || teamRead?.evidence || item.evidence
                : item.evidence;
              const suppliedCounterpoint =
                item.counterpoint.trim().length > 0 &&
                !looksLikeInternalIds(item.counterpoint)
                  ? item.counterpoint
                  : "";
              const repeatedDriverWhy =
                driver !== undefined &&
                view.drivers.some(
                  (candidate) =>
                    candidate.rank < driver.rank &&
                    editorialTextKey(candidate.why) ===
                      editorialTextKey(driver.why),
                );
              const dimensionCounterpoint =
                dimensionKey === "moat"
                  ? view.countercase
                  : dimensionKey === "adoption"
                    ? ko
                      ? "제품·서비스 매출 증가는 확산의 방향을 보여주지만, 설치 기반·활성 사용자·반복 이용 지표 없이는 확산의 깊이까지 확인할 수 없습니다."
                      : "Product and services growth shows direction, but adoption depth still needs installed-base, active-user, or repeat-usage evidence."
                    : "";
              const counterpoint =
                [
                  suppliedCounterpoint,
                  dimensionCounterpoint,
                  driver?.falsifier,
                  repeatedDriverWhy ? "" : driver?.why,
                  view.countercase,
                  teamRead?.strongestClaim,
                ]
                  .map((candidate) => candidate?.trim() ?? "")
                  .find(
                    (candidate) =>
                      candidate.length > 0 &&
                      editorialTextKey(candidate) !==
                        editorialTextKey(observedEvidence) &&
                      editorialTextKey(candidate) !==
                        editorialTextKey(item.agentView) &&
                      editorialTextKey(candidate) !==
                        editorialTextKey(item.checkpoint),
                  ) ?? view.countercase;
              return (
                <article key={item.id} data-evidence-id={item.evidenceId}>
                  <header>
                    <b>{`A${String(index + 1).padStart(2, "0")}`}</b>
                    <div>
                      <span>{dimensionLabel(dimensionKey, locale)}</span>
                      <EvidenceStrength
                        strength={item.strength}
                        locale={locale}
                      />
                    </div>
                  </header>
                  <div className="committee-claim-ledger__verdict">
                    <small>{ko ? "위원회 해석" : "Committee read"}</small>
                    <strong>{item.agentView}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>{ko ? "확인된 근거" : "Observed evidence"}</dt>
                      <dd>{observedEvidence}</dd>
                    </div>
                    <div>
                      <dt>{ko ? "반론·한계" : "Counterpoint / limit"}</dt>
                      <dd>{counterpoint}</dd>
                    </div>
                    <div>
                      <dt>{ko ? "다음 확인" : "Next check"}</dt>
                      <dd>{item.checkpoint}</dd>
                    </div>
                  </dl>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section
        className="committee-conflict-matrix research-editorial-section"
        data-report-section="adjudication"
        id="team-debate"
        aria-labelledby="committee-conflict-title"
      >
        <header>
          <span>03</span>
          <div>
            <h2 id="committee-conflict-title">
              {ko ? "네 팀의 판단 차이" : "Where the teams disagree"}
            </h2>
            <p>
              {ko
                ? "시장·기업·재무·리스크 팀의 독립 결론과 최종 반영 여부를 비교합니다."
                : "Compare the four independent team views and how each shaped the final call."}
            </p>
          </div>
        </header>
        <table
          className="committee-conflict-matrix__table"
          aria-label={ko ? "팀별 판단과 판정" : "Team views and adjudication"}
        >
          <thead className="sr-only">
            <tr>
              <th>{ko ? "팀" : "Team"}</th>
              <th>{ko ? "독립 판단" : "Independent view"}</th>
              <th>{ko ? "근거" : "Evidence"}</th>
              <th>{ko ? "판정" : "Adjudication"}</th>
            </tr>
          </thead>
          <tbody>
            {view.adjudicationRows.map((row) => (
              <tr key={row.departmentId}>
                <th scope="row">
                  <div className="committee-team-identity">
                    <Image
                      className="committee-conflict-matrix__portrait"
                      src={row.portraitPath}
                      alt=""
                      width={40}
                      height={40}
                    />
                    <div>
                      <strong>{row.teamName}</strong>
                      <em data-vote={row.vote}>
                        {voteLabels[row.vote][locale]}
                      </em>
                    </div>
                  </div>
                </th>
                <td>{row.strongestClaim}</td>
                <td>{row.evidence}</td>
                <td>
                  <strong>{row.adjudication}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        className="committee-expectations research-editorial-section"
        data-report-section="scenarios"
        id="decision-scenarios"
      >
        <header>
          <span>04</span>
          <div>
            <h2>
              {hasValuationData
                ? ko
                  ? "현재 가격이 성립하려면"
                  : "What must be true at this price"
                : ko
                  ? "실적 경로와 확인 조건"
                  : "Operating paths and checkpoints"}
            </h2>
            <p>
              {hasValuationData
                ? ko
                  ? "시장 기대, 회사가 증명해야 할 실적, 다음 공시의 확인 항목을 분리해 읽습니다."
                  : "Separate market expectations, the operating proof required, and what the next filing must confirm."
                : ko
                  ? "현재 근거가 허용하는 운영 경로와 확인 조건만 표시합니다."
                  : "Only operating paths supported by the current evidence are shown."}
            </p>
          </div>
        </header>
        {consensusForecastMetrics.length === 0 &&
        recommendationTotal === 0 ? null : (
          <section
            className="committee-expectations__consensus"
            data-layout={
              consensusForecastMetrics.length > 0 && recommendationTotal > 0
                ? "split"
                : "single"
            }
            aria-label={
              ko ? "시장 기대와 투자의견" : "Market expectations and ratings"
            }
          >
            {consensusForecastMetrics.length === 0 ? null : (
              <div className="committee-expectations__forecast-band">
                <header>
                  <span>{ko ? "컨센서스 전망" : "Consensus outlook"}</span>
                  <small>
                    {ko ? "현재 시장 기대치" : "Current market estimates"}
                  </small>
                </header>
                <dl data-metric-count={consensusForecastMetrics.length}>
                  {consensusForecastMetrics.map((metric) => (
                    <div key={metric.id}>
                      <dt>{metric.label}</dt>
                      <dd data-signal={metric.signal}>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {recommendationTotal === 0 ? null : (
              <div className="committee-expectations__ratings">
                <header>
                  <span>{ko ? "애널리스트 의견" : "Analyst ratings"}</span>
                  <strong>
                    {ko
                      ? `매수 ${buyRecommendationPercent}%`
                      : `${buyRecommendationPercent}% buy`}
                  </strong>
                </header>
                <div
                  className="committee-expectations__ratings-bar"
                  role="img"
                  aria-label={recommendationBreakdown
                    .map(
                      (item) =>
                        `${item.label} ${Math.round(recommendationPercent(item.count))}%`,
                    )
                    .join(", ")}
                >
                  {recommendationBreakdown.map((item) => (
                    <i
                      key={item.id}
                      data-rating={item.id}
                      style={{ width: `${recommendationPercent(item.count)}%` }}
                    />
                  ))}
                </div>
                <dl>
                  {recommendationBreakdown.map((item) => (
                    <div key={item.id}>
                      <dt>{item.label}</dt>
                      <dd>{item.count}</dd>
                    </div>
                  ))}
                </dl>
                <small>
                  {ko
                    ? `총 ${recommendationTotal}개 의견 기준`
                    : `${recommendationTotal} ratings in total`}
                </small>
              </div>
            )}
          </section>
        )}
        {view.valuationConclusion.length === 0 ? null : (
          <section className="committee-expectation-brief">
            <header>
              <span>
                {ko ? "가격 방어의 핵심 조건" : "Core price requirement"}
              </span>
              <h3>{view.valuationConclusion}</h3>
            </header>
            <dl>
              {expectationLenses.map((item, index) => (
                <div key={item.id}>
                  <dt>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {item.label}
                  </dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {view.valuationRows.length === 0 ? null : (
          <div className="committee-expectations__comparison">
            {view.valuationRows.map((row) => (
              <article key={row.label}>
                <h3>{row.label}</h3>
                <p>{row.companyView}</p>
                <small>{row.benchmarkLens}</small>
              </article>
            ))}
          </div>
        )}
        {view.scenarios.length === 0 ? null : (
          <div
            className="committee-operating-scenarios"
            data-operating-scenarios
          >
            <h3>{ko ? "운영 시나리오" : "Operating scenarios"}</h3>
            <div className="committee-operating-scenarios__grid">
              {view.scenarios.map((scenario) => (
                <article key={scenario.id}>
                  <strong>{scenario.label}</strong>
                  <p>{scenario.thesis}</p>
                  <ul>
                    {scenario.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {view.catalysts.length === 0 ? null : (
        <section
          className="committee-catalysts committee-owned-analysis research-editorial-section"
          data-report-section="catalysts"
          id="catalyst-clock"
        >
          <header>
            <span>05</span>
            <div>
              <h2>{ko ? "다가오는 판단 시점" : "Upcoming decision points"}</h2>
              <p>
                {ko
                  ? "어떤 이벤트가 언제 현재 판단을 강화하거나 약화하는지 봅니다."
                  : "See when upcoming events can strengthen or weaken the current view."}
              </p>
            </div>
          </header>
          <ol className="committee-catalyst-timeline">
            {view.catalysts.map((catalyst) => (
              <li
                key={catalyst.id}
                data-catalyst-claim-id={catalyst.id}
                data-catalyst-disposition={catalyst.disposition}
                data-catalyst-source-ids={catalyst.sourceIds.join(",")}
              >
                {catalyst.date === undefined ? null : (
                  <time dateTime={catalyst.date}>{catalyst.date}</time>
                )}
                <strong>
                  {catalyst.date === undefined
                    ? catalyst.headline
                    : catalyst.headline.replace(catalyst.date, "").trim()}
                </strong>
                <p>{catalyst.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {uniqueOwnedAnalysis.length === 0 ? null : (
        <section
          className="committee-owned-analysis research-editorial-section"
          data-report-section="analysis"
          id="role-owned-analysis"
        >
          <header>
            <span>{view.catalysts.length === 0 ? "05" : "06"}</span>
            <div>
              <h2>{ko ? "전문가별 추가 판단" : "Specialist findings"}</h2>
              <p>
                {ko
                  ? "앞선 논지 원장과 겹치지 않는 전문 분석만 남겼습니다."
                  : "Only specialist findings not already covered in the claim ledger remain here."}
              </p>
            </div>
          </header>
          <div
            className={`committee-owned-analysis__grid${
              uniqueOwnedAnalysis.length === 1 ? " is-single" : ""
            }`}
          >
            {uniqueOwnedAnalysis.map((item) => (
              <article
                key={item.id}
                data-analysis-claim-id={item.id}
                data-analysis-disposition={item.disposition}
                data-analysis-source-ids={item.sourceIds.join(",")}
              >
                <header>
                  <Image
                    src={item.portraitPath}
                    alt=""
                    width={36}
                    height={36}
                  />
                  <div>
                    <strong>{item.owner}</strong>
                    <span>{dimensionLabel(item.dimension, locale)}</span>
                  </div>
                  <em>{item.contribution}</em>
                </header>
                <p>{item.thesis}</p>
                <small>
                  <strong>
                    {ko ? "판단 변경 조건" : "What changes the view"}
                  </strong>
                  {item.falsifier}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
