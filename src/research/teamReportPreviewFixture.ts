import { buildAnticipatedQuestions } from "./anticipatedQuestions";
import type { LocalizedText, ResearchFileData } from "./compositions/types";
import type { WorkflowDepartmentId } from "./domain/roleRegistry";
import { researchFileFixture } from "./mockResearchFile";

const text = (en: string, ko: string): LocalizedText => ({ en, ko });

type TeamPreviewCopy = {
  readonly question: string;
  readonly posture: ResearchFileData["posture"];
  readonly postureLabel: LocalizedText;
  readonly thesis: LocalizedText;
  readonly expectation: LocalizedText;
  readonly scope: LocalizedText;
  readonly nextEvent: LocalizedText;
  readonly changeCondition: LocalizedText;
  readonly positives: readonly LocalizedText[];
  readonly concerns: readonly LocalizedText[];
  readonly analysis: ResearchFileData["analysis"];
  readonly teamPosition: LocalizedText;
  readonly teamRationale: LocalizedText;
  readonly vote: ResearchFileData["teamViews"][number]["vote"];
};

const TEAM_PREVIEW_COPY: Readonly<
  Record<WorkflowDepartmentId, TeamPreviewCopy>
> = {
  market: {
    question: "AI 인프라 수요는 다음 12개월에도 확장 국면일까?",
    posture: "positive",
    postureLabel: text("Demand regime intact", "수요 국면 유지"),
    thesis: text(
      "Cloud, sovereign, and enterprise demand still point in the same direction, but hyperscaler spending concentration makes the pace more fragile than the headline growth suggests.",
      "클라우드·소버린·기업 수요가 같은 방향을 가리키지만, 하이퍼스케일러 투자 집중도 때문에 헤드라인 성장률보다 확장 속도는 더 취약합니다.",
    ),
    expectation: text(
      "The market expects AI infrastructure budgets to remain protected even as broader technology spending normalizes.",
      "시장은 전반적인 기술 투자가 정상화돼도 AI 인프라 예산은 우선순위를 유지할 것으로 기대합니다.",
    ),
    scope: text(
      "Demand breadth, customer budgets, macro sensitivity, and competitive capacity.",
      "수요 저변·고객 예산·거시 민감도·경쟁 공급능력을 검증했습니다.",
    ),
    nextEvent: text(
      "Hyperscaler capex guidance and the next data-center revenue disclosure",
      "하이퍼스케일러 설비투자 가이던스와 다음 데이터센터 매출 공시",
    ),
    changeCondition: text(
      "Reassess if two major cloud customers reduce AI capex guidance together or if order growth stops translating into deployments.",
      "주요 클라우드 고객 두 곳 이상이 동시에 AI 설비투자 가이던스를 낮추거나 주문 증가가 실제 구축으로 이어지지 않으면 판단을 다시 검토합니다.",
    ),
    positives: [
      text(
        "Demand is broadening beyond one customer cohort",
        "수요가 단일 고객군 밖으로 확장",
      ),
      text(
        "AI budgets remain relatively protected",
        "AI 예산의 상대적 우선순위 유지",
      ),
      text(
        "Sovereign demand adds a second growth channel",
        "소버린 수요가 두 번째 성장 경로 제공",
      ),
    ],
    concerns: [
      text(
        "A few buyers still dominate incremental spending",
        "소수 고객이 신규 투자를 여전히 지배",
      ),
      text(
        "Power and deployment bottlenecks can delay revenue",
        "전력·구축 병목이 매출 인식을 지연",
      ),
      text(
        "A macro slowdown could shorten planning horizons",
        "거시 둔화가 투자 계획 기간을 단축",
      ),
    ],
    analysis: [
      {
        title: text("Demand breadth", "수요 저변"),
        summary: text(
          "Multiple buyer groups are expanding together.",
          "여러 구매자군이 동시에 확대되고 있습니다.",
        ),
        detail: text(
          "Cloud, sovereign, and enterprise signals reduce reliance on a single narrative.",
          "클라우드·소버린·기업 신호를 함께 봐 단일 수요 논리에 대한 의존도를 낮췄습니다.",
        ),
      },
      {
        title: text("Budget durability", "예산 지속성"),
        summary: text(
          "AI spending remains prioritized, not unconditional.",
          "AI 투자는 우선순위지만 무조건적이지는 않습니다.",
        ),
        detail: text(
          "Customer cash flow and utilization must support another capex step-up.",
          "고객 현금흐름과 가동률이 다음 설비투자 확대를 뒷받침해야 합니다.",
        ),
      },
      {
        title: text("Market inflection", "시장 변곡점"),
        summary: text(
          "Deployment pace is the earliest warning signal.",
          "실제 구축 속도가 가장 빠른 경고 신호입니다.",
        ),
        detail: text(
          "Order commentary matters less if lead times normalize while deployment schedules slip.",
          "리드타임은 정상화되는데 구축 일정이 밀리면 주문 코멘트의 의미가 약해집니다.",
        ),
      },
    ],
    teamPosition: text(
      "The AI infrastructure demand regime remains constructive, with concentration risk requiring active monitoring.",
      "AI 인프라 수요 국면은 여전히 긍정적이며 고객 집중도는 계속 확인해야 합니다.",
    ),
    teamRationale: text(
      "Independent demand, budget, and macro checks point in the same direction.",
      "수요·예산·거시 담당자의 독립 검토가 같은 방향을 가리킵니다.",
    ),
    vote: "support_with_reservations",
  },
  company: {
    question: "NVIDIA의 경쟁우위는 AI 가속기 경쟁 심화에도 유지될까?",
    posture: "positive",
    postureLabel: text("Moat remains durable", "경쟁우위 유지"),
    thesis: text(
      "CUDA, networking, systems, and developer workflow form a reinforcing platform; the key risk is not a single rival chip but customers reducing dependence across the stack.",
      "CUDA·네트워킹·시스템·개발자 워크플로가 서로 강화되는 플랫폼을 만들며, 핵심 위험은 단일 경쟁 칩보다 고객이 스택 전반의 의존도를 낮추는 것입니다.",
    ),
    expectation: text(
      "The business must convert its installed base into continued platform adoption, not rely only on accelerator scarcity.",
      "사업은 가속기 공급 부족에만 기대지 않고 설치 기반을 지속적인 플랫폼 채택으로 전환해야 합니다.",
    ),
    scope: text(
      "Product architecture, switching costs, ecosystem adoption, and execution cadence.",
      "제품 구조·전환 비용·생태계 채택·실행 주기를 검증했습니다.",
    ),
    nextEvent: text(
      "Blackwell deployment quality and software monetization disclosure",
      "Blackwell 구축 품질과 소프트웨어 수익화 공시",
    ),
    changeCondition: text(
      "Reassess if major customers move production workloads to alternative stacks without a measurable performance or workflow penalty.",
      "주요 고객이 성능이나 워크플로 손실 없이 실제 운영 워크로드를 대체 스택으로 이전하면 판단을 다시 검토합니다.",
    ),
    positives: [
      text(
        "The moat spans software, systems, and networking",
        "경쟁우위가 소프트웨어·시스템·네트워킹에 걸쳐 존재",
      ),
      text(
        "Developer familiarity compounds switching costs",
        "개발자 친숙도가 전환 비용을 누적",
      ),
      text(
        "Product cadence keeps the platform integrated",
        "제품 출시 주기가 플랫폼 통합성을 유지",
      ),
    ],
    concerns: [
      text(
        "Customers have a strategic reason to diversify",
        "고객에게 공급자 다변화 유인이 존재",
      ),
      text(
        "Execution complexity rises with full-system delivery",
        "풀시스템 공급 확대로 실행 복잡성이 증가",
      ),
      text(
        "Software economics remain less transparent",
        "소프트웨어 수익 구조의 공시가 제한적",
      ),
    ],
    analysis: [
      {
        title: text("Platform moat", "플랫폼 경쟁우위"),
        summary: text(
          "The advantage is broader than accelerator performance.",
          "경쟁우위는 가속기 성능보다 넓습니다.",
        ),
        detail: text(
          "Libraries, networking, systems, and deployment tooling raise the cost of replacing the full workflow.",
          "라이브러리·네트워킹·시스템·배포 도구가 전체 워크플로 교체 비용을 높입니다.",
        ),
      },
      {
        title: text("Execution quality", "실행 품질"),
        summary: text(
          "Complex systems delivery is now the main operating test.",
          "복잡한 시스템 공급이 핵심 실행 시험대입니다.",
        ),
        detail: text(
          "Ramp timing, yields, thermals, and customer deployment must stay synchronized.",
          "증산 시점·수율·열관리·고객 구축이 함께 맞물려야 합니다.",
        ),
      },
      {
        title: text("Competitive response", "경쟁 대응"),
        summary: text(
          "Custom silicon attacks specific workloads first.",
          "커스텀 반도체는 특정 워크로드부터 침투합니다.",
        ),
        detail: text(
          "The relevant measure is production workload migration, not announced benchmark parity.",
          "발표된 벤치마크 동등성보다 실제 운영 워크로드 이전을 봐야 합니다.",
        ),
      },
    ],
    teamPosition: text(
      "The platform moat remains durable, while customer-led diversification is the most credible erosion path.",
      "플랫폼 경쟁우위는 유지되며 고객 주도의 다변화가 가장 현실적인 훼손 경로입니다.",
    ),
    teamRationale: text(
      "Product, competition, and business-model reviews all support a platform-level advantage.",
      "제품·경쟁·사업모델 담당자의 검토가 모두 플랫폼 단위의 우위를 지지합니다.",
    ),
    vote: "support",
  },
  financial: {
    question: "현재 성장률과 수익성이 높은 밸류에이션을 정당화할까?",
    posture: "neutral",
    postureLabel: text(
      "Quality high, expectations demanding",
      "품질 우수·기대치 높음",
    ),
    thesis: text(
      "Cash generation and margins remain exceptional, but valuation support depends on growth normalizing more slowly than the market usually allows for semiconductor cycles.",
      "현금창출력과 마진은 탁월하지만, 밸류에이션을 지지하려면 성장률이 일반적인 반도체 사이클보다 느리게 정상화돼야 합니다.",
    ),
    expectation: text(
      "Current expectations require durable data-center growth, resilient gross margin, and limited working-capital leakage.",
      "현재 기대에는 데이터센터 성장 지속·총마진 방어·운전자본 누수 제한이 함께 필요합니다.",
    ),
    scope: text(
      "Growth quality, margin durability, cash conversion, and relative valuation.",
      "성장의 질·마진 지속성·현금 전환·상대 밸류에이션을 검증했습니다.",
    ),
    nextEvent: text(
      "Quarterly gross margin, free cash flow conversion, and forward guidance",
      "분기 총마진·잉여현금흐름 전환율·선행 가이던스",
    ),
    changeCondition: text(
      "Turn more cautious if gross margin falls below 72% while inventory and receivables grow faster than revenue; reassess upward if software mix expands with stable cash conversion.",
      "총마진이 72% 아래로 떨어지는 동시에 재고·매출채권이 매출보다 빠르게 늘면 더 보수적으로 전환하고, 현금 전환을 유지하며 소프트웨어 믹스가 확대되면 상향 검토합니다.",
    ),
    positives: [
      text(
        "Revenue growth converts strongly into cash",
        "매출 성장이 현금흐름으로 강하게 전환",
      ),
      text(
        "Gross margin supports premium economics",
        "총마진이 프리미엄 수익구조를 지지",
      ),
      text(
        "Balance-sheet capacity absorbs execution shocks",
        "재무 여력이 실행 충격을 흡수",
      ),
    ],
    concerns: [
      text(
        "Premium expectations amplify small misses",
        "높은 기대치가 작은 실적 미스를 증폭",
      ),
      text(
        "Customer concentration can distort visibility",
        "고객 집중도가 실적 가시성을 왜곡",
      ),
      text(
        "Working capital is an early quality check",
        "운전자본이 이익의 질을 조기에 경고",
      ),
    ],
    analysis: [
      {
        title: text("Growth quality", "성장의 질"),
        summary: text(
          "Growth is broad, but data center still sets the result.",
          "성장은 넓지만 데이터센터가 전체 실적을 좌우합니다.",
        ),
        detail: text(
          "Segment mix and customer concentration determine whether reported growth is repeatable.",
          "부문 믹스와 고객 집중도가 보고된 성장의 반복 가능성을 결정합니다.",
        ),
      },
      {
        title: text("Cash conversion", "현금 전환"),
        summary: text(
          "Cash generation confirms earnings quality so far.",
          "현재까지 현금창출이 이익의 질을 확인합니다.",
        ),
        detail: text(
          "Receivables, inventory, and supplier commitments are the earliest balance-sheet checks.",
          "매출채권·재고·공급자 약정이 가장 빠른 재무상태표 검증 지표입니다.",
        ),
      },
      {
        title: text("Valuation tolerance", "밸류에이션 허용오차"),
        summary: text(
          "A premium is defensible; its margin for error is narrow.",
          "프리미엄은 방어 가능하지만 오차 허용 폭이 좁습니다.",
        ),
        detail: text(
          "The relevant question is how long excess growth and margins persist together.",
          "초과 성장과 높은 마진이 함께 얼마나 오래 지속되는지가 핵심입니다.",
        ),
      },
    ],
    teamPosition: text(
      "Financial quality supports a premium, but the current expectation set leaves limited room for simultaneous growth and margin misses.",
      "재무 품질은 프리미엄을 지지하지만 현재 기대치는 성장과 마진의 동시 둔화를 거의 허용하지 않습니다.",
    ),
    teamRationale: text(
      "Accounting quality, cash conversion, and valuation checks agree on quality but differ on the size of the safety margin.",
      "회계 품질·현금 전환·가치평가 검토는 품질에는 동의하지만 안전마진의 크기에는 차이가 있습니다.",
    ),
    vote: "support_with_reservations",
  },
  risk: {
    question: "NVIDIA 투자 논리를 무너뜨릴 수 있는 핵심 리스크는 무엇일까?",
    posture: "caution",
    postureLabel: text(
      "Risk concentrated, not hidden",
      "리스크 집중·가시성 확보",
    ),
    thesis: text(
      "The most dangerous failure is a compound event: customer capex digestion, export restrictions, and deployment bottlenecks reinforcing one another before diversification offsets the shock.",
      "가장 위험한 실패 경로는 고객 설비투자 소화·수출 규제·구축 병목이 서로 강화되고, 수요 다변화가 충격을 상쇄하지 못하는 복합 상황입니다.",
    ),
    expectation: text(
      "The core thesis assumes policy friction stays manageable and customer utilization justifies another investment cycle.",
      "핵심 투자 논리는 정책 마찰이 관리 가능하고 고객 가동률이 다음 투자 사이클을 정당화한다고 가정합니다.",
    ),
    scope: text(
      "Failure paths, concentration, policy exposure, and observable early warnings.",
      "실패 경로·집중도·정책 노출·관찰 가능한 조기 경보를 검증했습니다.",
    ),
    nextEvent: text(
      "Export-rule updates, customer utilization signals, and inventory commitments",
      "수출 규정 변경·고객 가동률 신호·재고 및 구매 약정",
    ),
    changeCondition: text(
      "Escalate if export controls widen while customer deployment delays and inventory commitments rise in the same quarter.",
      "수출 규제가 확대되는 동시에 고객 구축 지연과 재고 약정이 같은 분기에 증가하면 위험 단계를 상향합니다.",
    ),
    positives: [
      text(
        "Large cash reserves increase response capacity",
        "풍부한 현금이 대응 여력을 확대",
      ),
      text(
        "Demand diversification can absorb isolated shocks",
        "수요 다변화가 개별 충격을 흡수",
      ),
      text(
        "Several key risks have observable leading indicators",
        "여러 핵심 리스크에 관찰 가능한 선행지표 존재",
      ),
    ],
    concerns: [
      text(
        "Customer and geography exposures can compound",
        "고객·지역 노출이 복합적으로 작용 가능",
      ),
      text(
        "Policy changes can strand tailored products",
        "정책 변경이 맞춤형 제품의 활용을 제한",
      ),
      text(
        "System complexity increases delivery dependencies",
        "시스템 복잡성이 공급 의존성을 확대",
      ),
    ],
    analysis: [
      {
        title: text("Compound downside", "복합 하방"),
        summary: text(
          "Risks become material when they arrive together.",
          "리스크는 동시에 발생할 때 중대해집니다.",
        ),
        detail: text(
          "Policy, customer budgets, and deployment constraints share the same revenue transmission path.",
          "정책·고객 예산·구축 제약이 동일한 매출 전이 경로를 공유합니다.",
        ),
      },
      {
        title: text("Concentration map", "집중도 지도"),
        summary: text(
          "A small group controls both demand and deployment pace.",
          "소수 고객이 수요와 구축 속도를 함께 좌우합니다.",
        ),
        detail: text(
          "Monitor customer disclosures, receivables, commitments, and utilization as one system.",
          "고객 공시·매출채권·약정·가동률을 하나의 체계로 관찰해야 합니다.",
        ),
      },
      {
        title: text("Early warnings", "조기 경보"),
        summary: text(
          "The thesis should weaken before revenue actually declines.",
          "실제 매출 감소 전에 투자 논리가 먼저 약해져야 합니다.",
        ),
        detail: text(
          "Delayed deployments, inventory growth, and narrower regional availability are leading signals.",
          "구축 지연·재고 증가·지역별 공급 범위 축소가 선행 신호입니다.",
        ),
      },
    ],
    teamPosition: text(
      "No single risk invalidates the thesis today, but correlated policy and customer shocks deserve explicit escalation triggers.",
      "현재 단일 리스크가 투자 논리를 무효화하지는 않지만 정책·고객 충격의 동시 발생에는 명시적 경보 조건이 필요합니다.",
    ),
    teamRationale: text(
      "Policy, concentration, and scenario reviews identify the same compound downside path.",
      "정책·집중도·시나리오 담당자의 검토가 같은 복합 하방 경로를 지목합니다.",
    ),
    vote: "abstain",
  },
};

const PREVIEW_REPORT_IDS = {
  baseline: "11111111-1111-4111-8111-111111111111",
  current: "22222222-2222-4222-8222-222222222222",
} as const;

export function teamReportPreviewFixture(
  departmentId: WorkflowDepartmentId,
): ResearchFileData {
  const base: ResearchFileData = researchFileFixture;
  const copy = TEAM_PREVIEW_COPY[departmentId];
  const originalTeam = base.teamViews.find(
    (team) => team.departmentId === departmentId,
  );
  if (originalTeam === undefined)
    throw new TypeError(`Missing preview team: ${departmentId}`);

  const report: ResearchFileData = {
    ...base,
    researchTarget: { kind: "department", departmentId },
    researchDirection: copy.question,
    metricSnapshot: {
      asOf: "2026-07-30T16:00:00.000Z",
      metrics: [
        {
          id: "current_price",
          label: text("Current price", "현재가"),
          category: "market",
          value: 172.41,
          unit: "USD_per_share",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "daily_change_percent",
          label: text("Previous-day change", "전일 대비"),
          category: "market",
          value: 1.8,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "relative_performance_3m",
          label: text("3-month performance", "3개월 수익률"),
          category: "market",
          value: 12.6,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "relative_performance_1y",
          label: text("1-year performance", "1년 수익률"),
          category: "market",
          value: 38.4,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "pe",
          label: text("P/E", "PER"),
          category: "market",
          value: 48.5,
          unit: "multiple",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "peer_premium:pe",
          label: text("P/E vs peers", "PER 동종업계 대비"),
          category: "market",
          value: 22.1,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "revenue_ttm",
          label: text("TTM revenue", "최근 12개월 매출"),
          category: "financial",
          value: 130_500_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "revenue_growth",
          label: text("Revenue growth", "매출 성장률"),
          category: "financial",
          value: 55.7,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "gross_margin",
          label: text("Gross margin", "매출총이익률"),
          category: "financial",
          value: 74.5,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "operating_margin",
          label: text("Operating margin", "영업이익률"),
          category: "financial",
          value: 61.8,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "free_cash_flow",
          label: text("Free cash flow", "잉여현금흐름"),
          category: "financial",
          value: 60_900_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "capital_expenditures",
          label: text("Capital expenditure", "설비투자"),
          category: "financial",
          value: 3_200_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "roic",
          label: text("Return on invested capital", "투하자본수익률"),
          category: "financial",
          value: 116.2,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "forward_pe",
          label: text("Forward P/E", "선행 PER"),
          category: "expectations",
          value: 34.2,
          unit: "multiple",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "cash",
          label: text("Cash and short-term investments", "현금·단기투자자산"),
          category: "risk",
          value: 43_200_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "higher_better",
        },
        {
          id: "net_debt",
          label: text("Net debt", "순부채"),
          category: "risk",
          value: -34_000_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "lower_better",
        },
        {
          id: "inventory",
          label: text("Inventory", "재고자산"),
          category: "risk",
          value: 11_200_000_000,
          unit: "USD",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "segment_share:data_center",
          label: text("Data Center segment share", "데이터센터 사업부 비중"),
          category: "company",
          value: 88,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "segment_share:gaming",
          label: text("Gaming segment share", "게이밍 사업부 비중"),
          category: "company",
          value: 9,
          unit: "percent",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
      ],
    },
    posture: copy.posture,
    postureLabel: copy.postureLabel,
    thesis: copy.thesis,
    expectation: copy.expectation,
    valuation: copy.scope,
    nextEvent: copy.nextEvent,
    changeCondition: copy.changeCondition,
    positives: copy.positives,
    concerns: copy.concerns,
    analysis: copy.analysis,
    claimMatrix: copy.analysis.map((item, index) => {
      const counterpoint = copy.concerns[index] ?? copy.concerns[0];
      const checkpoint =
        index === 2
          ? copy.changeCondition
          : index === 1
            ? copy.nextEvent
            : copy.analysis[index]?.detail;
      return {
        id: `${departmentId.toUpperCase()}-${index + 1}`,
        claim: text(
          `${item.summary.en} ${item.detail.en}`,
          `${item.summary.ko} ${item.detail.ko}`,
        ),
        verdict: index === 2 ? ("partial" as const) : ("entailed" as const),
        sourceCount: index === 0 ? 3 : 2,
        sourceRefs: index === 0 ? ["S01", "S02", "S03"] : ["S01", "S03"],
        strength:
          index === 0
            ? ("strong" as const)
            : index === 1
              ? ("moderate" as const)
              : ("limited" as const),
        ...(counterpoint === undefined ? {} : { counterpoint }),
        ...(checkpoint === undefined ? {} : { checkpoint }),
      };
    }),
    teamViews: [
      {
        ...originalTeam,
        vote: copy.vote,
        position: copy.teamPosition,
        rationale: copy.teamRationale,
      },
    ],
    scenarios: [
      {
        id: "confirm",
        label: text("Confirmation", "확인"),
        probability: "—",
        thesis: copy.positives[0] ?? copy.thesis,
        assumptions: [
          {
            kind: "unverified",
            note: copy.nextEvent,
          },
        ],
      },
      {
        id: "watch",
        label: text("Watch", "주의"),
        probability: "—",
        thesis: copy.concerns[0] ?? copy.thesis,
        assumptions: [
          {
            kind: "unverified",
            note: copy.concerns[1] ?? copy.changeCondition,
          },
        ],
      },
      {
        id: "reverse",
        label: text("Reversal trigger", "판단 반전"),
        probability: "—",
        thesis: copy.changeCondition,
        assumptions: [
          {
            kind: "unverified",
            note: copy.changeCondition,
          },
        ],
      },
    ],
    appendix: [
      {
        title: text("Specialist inputs retained", "채택한 팀원 검토"),
        items: copy.analysis.map((item) => item.summary),
      },
      {
        title: text("Unresolved team questions", "팀 내부 미확인 질문"),
        items: copy.concerns,
      },
    ],
    comparison: {
      baselineReportId: PREVIEW_REPORT_IDS.baseline,
      currentReportId: PREVIEW_REPORT_IDS.current,
      baselinePublishedAt: "2026-06-26T16:00:00.000Z",
      currentPublishedAt: "2026-07-30T16:00:00.000Z",
      conclusion: {
        previous: text(
          "The evidence was constructive, but the next disclosure remained decisive.",
          "근거는 긍정적이었지만 다음 공시 확인이 결정적이었습니다.",
        ),
        current: copy.teamPosition,
        direction: departmentId === "risk" ? "weakened" : "strengthened",
      },
      materialChanges: [
        {
          id: `${departmentId}-change-1`,
          kind: departmentId === "risk" ? "weakened" : "strengthened",
          title: text(
            "New evidence changed confidence",
            "새 근거로 확신도 변화",
          ),
          detail: copy.analysis[0]?.summary ?? copy.thesis,
          sourceIds: [],
        },
        {
          id: `${departmentId}-change-2`,
          kind: "added",
          title: text("New monitoring condition", "새 관찰 조건"),
          detail: copy.changeCondition,
          sourceIds: [],
        },
      ],
      dataChanges: [],
      metrics: [
        { id: "sources", previous: 10, current: 14, delta: 4, unit: "count" },
        {
          id: "material_claims",
          previous: 7,
          current: 9,
          delta: 2,
          unit: "count",
        },
        {
          id: "evidence_confidence",
          previous: 78,
          current: departmentId === "risk" ? 74 : 86,
          delta: departmentId === "risk" ? -4 : 8,
          unit: "percent",
        },
      ],
      nextCondition: copy.changeCondition,
      noMaterialChange: false,
    },
  };
  return {
    ...report,
    anticipatedQuestions: buildAnticipatedQuestions(report),
  };
}
