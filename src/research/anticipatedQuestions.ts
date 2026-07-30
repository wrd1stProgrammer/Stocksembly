import type { LocalizedText, ResearchFileData } from "./compositions/types";
import type { ResearchMetricPoint } from "./domain/metricSnapshot";

export type AnticipatedQuestion = {
  readonly id: string;
  readonly question: LocalizedText;
  readonly answer: LocalizedText;
  readonly lens: LocalizedText;
};

const TEAM_LABELS = {
  market: { en: "Market team", ko: "시장 팀" },
  company: { en: "Company team", ko: "기업 팀" },
  financial: { en: "Financial team", ko: "재무 팀" },
  risk: { en: "Risk team", ko: "리스크 팀" },
} as const;

const TEAM_QUESTIONS = {
  market: [
    {
      en: "Am I late at this price, or is there still an unpriced catalyst?",
      ko: "지금 가격에 들어가면 늦은 건가요, 아직 덜 반영된 촉매가 있나요?",
    },
    {
      en: "Is this a durable trend or a crowded trade waiting to unwind?",
      ko: "지금 흐름은 지속 가능한 추세인가요, 되감길 가능성이 큰 쏠림인가요?",
    },
    {
      en: "What premium am I paying versus peers, and is it earned?",
      ko: "동종업계보다 얼마나 비싸게 사는 것이며, 그 프리미엄은 정당한가요?",
    },
    {
      en: "Which market expectation is most likely to break first?",
      ko: "시장 기대 중 가장 먼저 깨질 가능성이 큰 것은 무엇인가요?",
    },
    {
      en: "What exact signal would justify adding exposure rather than waiting?",
      ko: "기다리지 않고 비중을 늘려도 된다는 구체적 신호는 무엇인가요?",
    },
    {
      en: "What is the fastest signal that this market call is wrong?",
      ko: "이 시장 판단이 틀렸다고 가장 빨리 인정해야 할 신호는 무엇인가요?",
    },
  ],
  company: [
    {
      en: "What does this company have that competitors cannot copy quickly?",
      ko: "경쟁사가 단기간에 복제하기 어려운 진짜 우위는 무엇인가요?",
    },
    {
      en: "Which product or segment actually carries the thesis—and what if it stalls?",
      ko: "투자 논지를 실제로 떠받치는 제품·사업부는 어디이며, 그곳이 멈추면 어떻게 되나요?",
    },
    {
      en: "Is growth driven by repeat demand or a temporary spending cycle?",
      ko: "성장은 반복 수요에서 나오나요, 일시적인 지출 사이클에 기대고 있나요?",
    },
    {
      en: "Where can management most plausibly fumble execution?",
      ko: "경영진이 실행에서 가장 현실적으로 실수할 지점은 어디인가요?",
    },
    {
      en: "Which operating proof would show the moat is widening, not just claimed?",
      ko: "해자가 말뿐 아니라 실제로 넓어지고 있음을 보여줄 운영 지표는 무엇인가요?",
    },
    {
      en: "What would force us to abandon the company thesis?",
      ko: "어떤 일이 생기면 이 기업 투자 논지를 폐기해야 하나요?",
    },
  ],
  financial: [
    {
      en: "Is reported growth turning into cash, or merely consuming more capital?",
      ko: "보고된 성장은 현금으로 바뀌나요, 아니면 더 많은 자본을 소모하나요?",
    },
    {
      en: "Are margins structurally improving, or are they near a cyclical peak?",
      ko: "마진은 구조적으로 개선 중인가요, 아니면 경기 고점에 가까운가요?",
    },
    {
      en: "How much of accounting profit survives as free cash flow?",
      ko: "회계상 이익 중 실제 잉여현금흐름으로 남는 몫은 얼마나 되나요?",
    },
    {
      en: "Can the balance sheet absorb a bad year without dilution or retrenchment?",
      ko: "나쁜 한 해가 와도 희석이나 투자 축소 없이 버틸 재무 체력이 있나요?",
    },
    {
      en: "What growth and margin outcome must occur just to defend today's price?",
      ko: "현재 가격만 방어하려 해도 어떤 성장률과 마진을 달성해야 하나요?",
    },
    {
      en: "Which financial miss would break the thesis immediately?",
      ko: "어떤 재무 지표가 빗나가면 투자 논지가 즉시 깨지나요?",
    },
  ],
  risk: [
    {
      en: "What is the most realistic path to a 20–30% drawdown?",
      ko: "주가가 20~30% 빠질 가장 현실적인 경로는 무엇인가요?",
    },
    {
      en: "How does that risk travel from trigger to revenue, margins, and valuation?",
      ko: "그 위험은 어떤 경로로 매출·마진·밸류에이션까지 번지나요?",
    },
    {
      en: "Which leading indicator will flash red before earnings reveal the damage?",
      ko: "실적에 손상이 드러나기 전에 먼저 빨간불이 켜질 지표는 무엇인가요?",
    },
    {
      en: "Which risks are correlated and could hit at the same time?",
      ko: "서로 연결돼 동시에 터질 수 있는 위험은 무엇인가요?",
    },
    {
      en: "Is the supposed downside buffer real, or already priced in?",
      ko: "하방 완충 요인은 실제 방어력인가요, 이미 가격에 반영된 기대인가요?",
    },
    {
      en: "What exact result would confirm that this risk is becoming real?",
      ko: "어떤 결과가 나오면 이 위험이 실제로 커지고 있다고 봐야 하나요?",
    },
  ],
} as const;

const COMMITTEE_TEAM_QUESTIONS = {
  market: {
    en: "Is the stock still buyable here, or has the market already priced in the good news?",
    ko: "이 가격에서도 살 만한가요, 좋은 뉴스가 이미 전부 반영됐나요?",
  },
  company: {
    en: "Which business advantage is real—and which part of the story is weakest?",
    ko: "실제로 확인된 사업 우위는 무엇이며, 성장 서사에서 가장 약한 고리는 어디인가요?",
  },
  financial: {
    en: "Are earnings and cash flow strong enough to defend today's valuation?",
    ko: "현재 밸류에이션을 방어할 만큼 이익과 현금흐름이 강한가요?",
  },
  risk: {
    en: "What is the most plausible way this stock loses 20–30%?",
    ko: "이 종목이 20~30% 하락할 가장 현실적인 경로는 무엇인가요?",
  },
} as const;

function formatMetric(metric: ResearchMetricPoint): LocalizedText {
  const localeValue = (locale: "en" | "ko") => {
    const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
    if (metric.unit === "percent")
      return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%`;
    if (metric.unit === "multiple")
      return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}x`;
    if (metric.unit === "USD_per_share")
      return `$${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 2 })}`;
    if (metric.unit === "count")
      return metric.value.toLocaleString(numberLocale, {
        maximumFractionDigits: 0,
      });
    return new Intl.NumberFormat(numberLocale, {
      notation: Math.abs(metric.value) >= 1_000_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
      ...(metric.unit === "USD" ? { style: "currency", currency: "USD" } : {}),
    }).format(metric.value);
  };
  return {
    en: `${metric.label.en} is ${localeValue("en")}${metric.period === undefined ? "" : ` (${metric.period})`}.`,
    ko: `${metric.label.ko}은(는) ${localeValue("ko")}${metric.period === undefined ? "" : ` (${metric.period})`}입니다.`,
  };
}

function metricAnswer(
  file: ResearchFileData,
  category: ResearchMetricPoint["category"],
  offset: number,
): LocalizedText | undefined {
  const metrics =
    file.metricSnapshot?.metrics.filter(
      (metric) => metric.category === category,
    ) ?? [];
  const metric = metrics[offset % Math.max(1, metrics.length)];
  return metric === undefined ? undefined : formatMetric(metric);
}

function analysisAnswer(
  file: ResearchFileData,
  index: number,
): LocalizedText | undefined {
  const section = file.analysis[index % Math.max(1, file.analysis.length)];
  if (section === undefined) return undefined;
  return {
    en: `${section.summary.en} ${section.detail.en}`.trim(),
    ko: `${section.summary.ko} ${section.detail.ko}`.trim(),
  };
}

function qa(
  id: string,
  question: LocalizedText,
  answer: LocalizedText,
  lens: LocalizedText,
): AnticipatedQuestion {
  return { id, question, answer, lens };
}

function combineAnswers(
  first: LocalizedText,
  second: LocalizedText,
): LocalizedText {
  const combine = (locale: "en" | "ko") => {
    const left = first[locale].trim();
    const right = second[locale].trim();
    if (left === right || left.includes(right)) return left;
    if (right.includes(left)) return right;
    const separator = /[.!?。！？]$/u.test(left) ? " " : ". ";
    return `${left}${separator}${right}`;
  };
  return { en: combine("en"), ko: combine("ko") };
}

export function buildAnticipatedQuestions(
  file: ResearchFileData,
): readonly AnticipatedQuestion[] {
  const department =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const teamView =
    department === undefined
      ? undefined
      : file.teamViews.find((view) => view.departmentId === department);
  const strongest = file.positives[0] ?? file.expectation;
  const objection = file.concerns[0] ?? file.changeCondition;
  const commonLens = { en: "Research chair", ko: "리서치 의장" };
  const supportingAnswer = combineAnswers(
    strongest,
    teamView?.rationale ?? file.expectation,
  );
  const counterAnswer = combineAnswers(objection, file.changeCondition);

  if (department === undefined) {
    const teamQuestions = file.teamViews
      .slice(0, 4)
      .map((view) =>
        qa(
          `team-${view.departmentId}`,
          COMMITTEE_TEAM_QUESTIONS[view.departmentId],
          combineAnswers(view.position, view.rationale),
          view.teamName,
        ),
      );
    return [
      qa(
        "verdict",
        {
          en: "Bottom line: would you buy now, wait, or walk away?",
          ko: "결론적으로 지금 살 건가요, 기다릴 건가요, 피할 건가요?",
        },
        combineAnswers(file.thesis, file.valuation),
        commonLens,
      ),
      qa(
        "priced-in",
        {
          en: "Which optimistic assumption is the stock price already demanding?",
          ko: "현재 주가가 이미 요구하는 가장 낙관적인 가정은 무엇인가요?",
        },
        combineAnswers(file.valuation, file.expectation),
        { en: "Financial team", ko: "재무 팀" },
      ),
      qa(
        "downside-path",
        {
          en: "What is the cleanest path to a 20–30% drawdown?",
          ko: "주가가 20~30% 빠질 가장 분명한 경로는 무엇인가요?",
        },
        combineAnswers(objection, file.changeCondition),
        { en: "Risk team", ko: "리스크 팀" },
      ),
      ...teamQuestions,
      qa(
        "next-event",
        {
          en: "At the next earnings release, which proof matters most?",
          ko: "다음 실적 발표에서 가장 먼저 확인할 결정적 근거는 무엇인가요?",
        },
        combineAnswers(file.nextEvent, supportingAnswer),
        commonLens,
      ),
      qa(
        "change-condition",
        {
          en: "What exact result would force the committee to reverse its conclusion?",
          ko: "어떤 결과가 나오면 위원회가 지금 결론을 뒤집어야 하나요?",
        },
        combineAnswers(file.changeCondition, counterAnswer),
        commonLens,
      ),
    ].slice(0, 10);
  }

  const category: ResearchMetricPoint["category"] =
    department === "financial"
      ? "financial"
      : department === "risk"
        ? "risk"
        : department === "company"
          ? "company"
          : "market";
  const tailored = TEAM_QUESTIONS[department];
  const fallbackAnswers =
    department === "market"
      ? [
          combineAnswers(teamView?.position ?? file.thesis, file.valuation),
          combineAnswers(teamView?.rationale ?? strongest, strongest),
          combineAnswers(
            file.valuation,
            metricAnswer(file, "market", 0) ?? file.expectation,
          ),
          combineAnswers(file.expectation, objection),
          combineAnswers(file.nextEvent, strongest),
          combineAnswers(file.changeCondition, objection),
        ]
      : department === "company"
        ? [
            teamView?.position ?? file.thesis,
            metricAnswer(file, category, 0) ??
              analysisAnswer(file, 0) ??
              strongest,
            analysisAnswer(file, 1) ?? file.expectation,
            objection,
            file.nextEvent,
            file.changeCondition,
          ]
        : department === "financial"
          ? [
              metricAnswer(file, category, 0) ??
                analysisAnswer(file, 0) ??
                strongest,
              metricAnswer(file, category, 1) ??
                analysisAnswer(file, 1) ??
                file.expectation,
              analysisAnswer(file, 2) ?? teamView?.rationale ?? strongest,
              metricAnswer(file, "risk", 0) ??
                teamView?.position ??
                file.thesis,
              file.valuation,
              file.changeCondition,
            ]
          : [
              objection,
              analysisAnswer(file, 0) ?? teamView?.rationale ?? file.thesis,
              metricAnswer(file, category, 0) ??
                analysisAnswer(file, 1) ??
                file.nextEvent,
              analysisAnswer(file, 2) ?? file.expectation,
              combineAnswers(
                strongest,
                teamView?.rationale ?? file.expectation,
              ),
              file.changeCondition,
            ];
  return [
    ...tailored.map((question, index) =>
      qa(
        `${department}-${index + 1}`,
        question,
        fallbackAnswers[index] ?? file.thesis,
        TEAM_LABELS[department],
      ),
    ),
    qa(
      `${department}-evidence`,
      {
        en: "What is the strongest evidence behind this team view?",
        ko: "이 팀 판단을 지지하는 가장 강한 근거는 무엇인가요?",
      },
      supportingAnswer,
      TEAM_LABELS[department],
    ),
    qa(
      `${department}-objection`,
      {
        en:
          department === "risk"
            ? "Which hidden risk is the market least prepared for?"
            : "What is the best counterargument?",
        ko:
          department === "risk"
            ? "시장이 가장 대비하지 못한 숨은 위험은 무엇인가요?"
            : "가장 설득력 있는 반론은 무엇인가요?",
      },
      counterAnswer,
      TEAM_LABELS[department],
    ),
    qa(
      `${department}-quality`,
      {
        en: "What hard number or event should I check first?",
        ko: "가장 먼저 확인해야 할 숫자나 이벤트는 무엇인가요?",
      },
      combineAnswers(
        metricAnswer(file, category, 0) ??
          metricAnswer(file, "market", 0) ??
          file.nextEvent,
        file.nextEvent,
      ),
      TEAM_LABELS[department],
    ),
    qa(
      `${department}-scope`,
      {
        en:
          department === "risk"
            ? "What result would force an immediate change in the risk level?"
            : "What would prove this team wrong before the next full report?",
        ko:
          department === "risk"
            ? "어떤 결과가 나오면 리스크 단계를 즉시 바꿔야 하나요?"
            : "다음 전체 리포트 전이라도 이 팀이 틀렸음을 입증할 신호는 무엇인가요?",
      },
      combineAnswers(
        file.changeCondition,
        department === "risk" ? objection : (teamView?.position ?? file.thesis),
      ),
      TEAM_LABELS[department],
    ),
  ];
}
