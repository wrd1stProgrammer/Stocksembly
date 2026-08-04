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
      "2026-08-27 · Hyperscaler capex guidance and the next data-center revenue disclosure",
      "2026-08-27 · 하이퍼스케일러 설비투자 가이던스와 다음 데이터센터 매출 공시",
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
      {
        title: text("Macro transmission", "거시 전이"),
        summary: text(
          "Rates matter through customer hurdle rates, not as a generic risk-off label.",
          "금리는 막연한 위험회피 요인이 아니라 고객의 투자 허들레이트를 통해 수요에 영향을 줍니다.",
        ),
        detail: text(
          "A higher discount rate becomes material when project payback periods extend and utilization stops improving.",
          "할인율 상승은 프로젝트 회수기간이 늘고 가동률 개선이 멈출 때 실질적인 수요 제약으로 전환됩니다.",
        ),
      },
      {
        title: text("Relative strength", "상대 강도"),
        summary: text(
          "Absolute gains are useful only if the stock also leads its qualified peer and sector.",
          "절대수익률만으로는 부족하며 검증된 경쟁사와 섹터 대비 초과성과가 함께 나타나야 합니다.",
        ),
        detail: text(
          "Relative leadership must persist across more than one horizon instead of relying on a single rebound window.",
          "단일 반등 구간이 아니라 둘 이상의 기간에서 상대 우위가 지속되는지를 확인합니다.",
        ),
      },
      {
        title: text("Catalyst asymmetry", "촉매 비대칭"),
        summary: text(
          "Capex guidance matters only when the price response confirms that expectations were not already exhausted.",
          "설비투자 가이던스는 발표 후 가격 반응이 기대 소진이 아님을 확인할 때만 유효한 촉매입니다.",
        ),
        detail: text(
          "A positive disclosure followed by weak breadth and volume is treated as distribution, not confirmation.",
          "긍정적 공시 뒤에도 시장 폭과 거래량이 약하면 확인 신호가 아니라 매물 소화로 해석합니다.",
        ),
      },
      {
        title: text("Flow confirmation", "수급 확인"),
        summary: text(
          "A breakout is actionable only when participation expands with price.",
          "가격 돌파는 거래 참여가 함께 확대될 때만 실행 가능한 신호입니다.",
        ),
        detail: text(
          "Require volume above its 20-day baseline and improving breadth; a price-only spike is treated as a fragile squeeze.",
          "거래량이 20일 기준선을 웃돌고 시장 폭이 개선되는지 확인하며, 가격만 튀는 움직임은 취약한 숏커버로 봅니다.",
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
      {
        title: text("Revenue concentration", "매출 집중도"),
        summary: text(
          "A dominant segment accelerates growth but makes execution misses harder to diversify away.",
          "주력 사업부의 높은 비중은 성장을 가속하지만 실행 차질을 다른 사업으로 상쇄하기 어렵게 합니다.",
        ),
        detail: text(
          "The test is whether adjacent products and software increase wallet share without weakening core economics.",
          "인접 제품과 소프트웨어가 핵심 수익성을 훼손하지 않고 고객 지출 비중을 넓히는지 확인해야 합니다.",
        ),
      },
      {
        title: text("Management execution", "경영진 실행력"),
        summary: text(
          "Product cadence creates value only when supply, deployment, and monetization arrive together.",
          "제품 출시 주기는 공급·구축·수익화가 함께 이뤄질 때만 기업가치로 전환됩니다.",
        ),
        detail: text(
          "Watch ramp quality, customer deployment time, and software attach rather than launch announcements alone.",
          "출시 발표보다 증산 품질·고객 구축 기간·소프트웨어 결합률을 함께 봅니다.",
        ),
      },
      {
        title: text("Moat erosion path", "해자 훼손 경로"),
        summary: text(
          "The credible threat is gradual workload unbundling, not one benchmark win.",
          "현실적인 위협은 단일 벤치마크 승리가 아니라 워크로드가 점진적으로 분리되는 과정입니다.",
        ),
        detail: text(
          "The moat weakens when customers can move production workloads while preserving performance, tooling, and economics.",
          "고객이 성능·도구·경제성을 유지하며 운영 워크로드를 이전할 수 있을 때 해자가 약해집니다.",
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
      {
        title: text("Operating leverage", "영업 레버리지"),
        summary: text(
          "Margin quality depends on mix and operating discipline, not revenue growth alone.",
          "마진의 질은 매출 성장률만이 아니라 제품 믹스와 영업비용 통제에 달려 있습니다.",
        ),
        detail: text(
          "Separate gross-margin expansion from expense leverage to identify which part of profitability is repeatable.",
          "총마진 개선과 비용 레버리지를 분리해 어느 수익성이 반복 가능한지 확인합니다.",
        ),
      },
      {
        title: text("Reinvestment return", "재투자 수익성"),
        summary: text(
          "Low capital intensity is valuable only while capacity and product cadence remain unconstrained.",
          "낮은 자본집약도는 생산능력과 제품 출시가 제약받지 않을 때만 강점입니다.",
        ),
        detail: text(
          "Compare capex growth with revenue, free cash flow, and return on invested capital before calling reinvestment efficient.",
          "재투자 효율을 판단할 때 설비투자 증가율을 매출·잉여현금·투하자본수익률과 대조합니다.",
        ),
      },
      {
        title: text("Embedded expectations", "내재 기대"),
        summary: text(
          "The observed multiple leaves little tolerance for simultaneous growth and margin misses.",
          "관측된 밸류에이션은 성장과 마진이 동시에 기대를 밑도는 상황을 거의 허용하지 않습니다.",
        ),
        detail: text(
          "Translate the multiple into required earnings durability and specify the rerating trigger before discussing upside.",
          "상승 여력을 논하기 전에 배수가 요구하는 이익 지속기간과 재평가 조건을 명시합니다.",
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
      {
        title: text("Financial transmission", "재무 전이"),
        summary: text(
          "A risk matters when it reaches revenue timing, margin, cash conversion, or the valuation multiple.",
          "위험은 매출 인식·마진·현금 전환·밸류에이션 배수로 전이될 때 투자 판단에 중요해집니다.",
        ),
        detail: text(
          "Map every trigger to a measurable financial line instead of repeating a generic uncertainty label.",
          "막연한 불확실성 대신 모든 촉발 요인을 측정 가능한 재무 항목에 연결합니다.",
        ),
      },
      {
        title: text("Buffer strength", "완충력"),
        summary: text(
          "Cash can absorb an isolated shock but cannot offset a persistent demand and policy reset.",
          "현금은 단일 충격을 흡수할 수 있지만 수요와 정책이 동시에 장기적으로 악화되는 상황까지 상쇄하지는 못합니다.",
        ),
        detail: text(
          "Judge the buffer against commitments, working-capital needs, and the duration of the downside path.",
          "완충력은 구매 약정·운전자본 수요·하방 지속기간과 함께 평가합니다.",
        ),
      },
      {
        title: text("Recovery condition", "회복 조건"),
        summary: text(
          "A risk call improves only when the leading indicator reverses before reported earnings recover.",
          "리스크 판단은 보고 실적 회복보다 선행지표가 먼저 반전할 때 개선됩니다.",
        ),
        detail: text(
          "Require deployment normalization, stable commitments, and policy clarity rather than relying on management reassurance.",
          "경영진의 안심 발언보다 구축 정상화·약정 안정·정책 명확성을 확인합니다.",
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
          period: "3M",
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
          period: "1Y",
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
          period: "TTM",
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
          period: "TTM",
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
          period: "TTM",
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
          period: "NTM",
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
          period: "FY2026 Q2",
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
          period: "FY2026 Q2",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "support_price:primary",
          label: text("Primary support", "1차 지지선"),
          category: "market",
          value: 158,
          unit: "USD_per_share",
          period: "20D",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "resistance_price:primary",
          label: text("Primary resistance", "1차 저항선"),
          category: "market",
          value: 184,
          unit: "USD_per_share",
          period: "20D",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
        {
          id: "average_volume_20d",
          label: text("20-day average volume", "20일 평균 거래량"),
          category: "market",
          value: 198000000,
          unit: "count",
          period: "20D",
          observedAt: "2026-07-30T16:00:00.000Z",
          source: "insightsentry",
          signal: "contextual",
        },
      ],
      comparatorQualification: {
        status: "qualified",
        rawPeerArtifactId: "S03",
        rawArtifactCount: 1,
        rows: [
          {
            comparatorId: "amd-qualified",
            name: "AMD",
            role: "direct_competitor",
            rationale: text(
              "Overlapping accelerator and data-center customer markets.",
              "가속기 제품과 데이터센터 고객 시장이 겹칩니다.",
            ),
            comparableMetricKeys: [
              "relative_performance_3m",
              "relative_performance_1y",
              "revenue_growth",
              "operating_margin",
              "forward_pe",
            ],
            normalizedMetrics: [
              {
                key: "relative_performance_3m",
                value: 4.1,
                period: "3M",
                unit: "percent",
                evidenceArtifactIds: ["S03"],
              },
              {
                key: "relative_performance_1y",
                value: 17.2,
                period: "1Y",
                unit: "percent",
                evidenceArtifactIds: ["S03"],
              },
              {
                key: "revenue_growth",
                value: 31.2,
                period: "TTM",
                unit: "percent",
                evidenceArtifactIds: ["S03"],
              },
              {
                key: "operating_margin",
                value: 22.4,
                period: "TTM",
                unit: "percent",
                evidenceArtifactIds: ["S03"],
              },
              {
                key: "forward_pe",
                value: 29.8,
                period: "NTM",
                unit: "multiple",
                evidenceArtifactIds: ["S03"],
              },
            ],
            evidenceArtifactIds: ["S03"],
            displayEligibility: true,
            medianEligibility: false,
            exclusionReasons: [],
          },
        ],
        displayGroups: [
          { role: "direct_competitor", comparatorIds: ["amd-qualified"] },
        ],
        valuation: {
          status: "not_eligible",
          reason: "insufficient_eligible_companies",
          eligibleCompanyCount: 1,
        },
      },
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
  const structuredReport = withStructuredTeamProductData(report, departmentId);
  const productReport =
    departmentId === "financial"
      ? withFinancialProductData(structuredReport)
      : departmentId === "risk"
        ? withRiskProductData(structuredReport)
        : structuredReport;
  return {
    ...productReport,
    anticipatedQuestions: buildAnticipatedQuestions({
      ...productReport,
      presentationVersion: "legacy-v1",
    }),
  };
}

function withStructuredTeamProductData(
  report: ResearchFileData,
  departmentId: WorkflowDepartmentId,
): ResearchFileData {
  type EditorialClaim = NonNullable<
    NonNullable<ResearchFileData["structuredEditorial"]>["claims"]
  >[number];
  const blueprints = {
    market: [
      ["market", "regime", 0],
      ["market", "regime", 3],
      ["market", "catalyst", 5],
      ["market_news", "timing", 2],
      ["market_news", "timing", 6],
      ["benchmark", "relative_performance", 4],
      ["benchmark", "relative_performance", 1],
    ],
    company: [
      ["company", "growth_engine", 3],
      ["company", "growth_engine", 4],
      ["company_product", "adoption", 1],
      ["company_product", "adoption", 0],
      ["company_competition", "moat", 2],
      ["company_competition", "competitive_erosion", 5],
    ],
    financial: [
      ["financial", "margin", 3],
      ["financial", "reinvestment", 4],
      ["valuation", "embedded_expectations", 2],
      ["valuation", "embedded_expectations", 5],
      ["financial_quality", "cash_conversion", 0],
      ["financial_quality", "cash_conversion", 1],
    ],
    risk: [
      ["risk", "downside_path", 0],
      ["risk", "downside_path", 1],
      ["risk", "leading_indicator", 3],
      ["risk_policy", "leading_indicator", 2],
      ["risk_policy", "mitigant", 4],
      ["risk_policy", "mitigant", 5],
    ],
  } as const;
  const metricIds = {
    market: [
      ["relative_performance_3m"],
      ["daily_change_percent"],
      ["current_price"],
      ["support_price:primary", "resistance_price:primary"],
      ["average_volume_20d"],
      ["relative_performance_3m", "relative_performance_1y"],
      ["pe", "peer_premium:pe"],
    ],
    company: [
      ["segment_share:data_center", "segment_share:gaming"],
      ["revenue_growth"],
      ["revenue_growth", "segment_share:data_center"],
      ["gross_margin"],
      ["operating_margin"],
      ["forward_pe"],
    ],
    financial: [
      ["gross_margin", "operating_margin"],
      ["capital_expenditures", "roic"],
      ["free_cash_flow", "revenue_ttm"],
      ["operating_margin"],
      ["cash", "net_debt"],
      ["forward_pe"],
    ],
    risk: [
      ["inventory"],
      ["inventory"],
      ["revenue_growth", "operating_margin"],
      ["daily_change_percent"],
      ["cash", "net_debt"],
      ["cash"],
    ],
  } as const;
  const claims = blueprints[departmentId].map((blueprint, index) => {
    const [roleOwner, decisionDimension, analysisIndex] = blueprint;
    const analysis = report.analysis[analysisIndex]!;
    return {
      claimId: `00000000-0000-4000-8000-${String(500 + index + Object.keys(blueprints).indexOf(departmentId) * 10).padStart(12, "0")}`,
      decisionDimension,
      roleOwner,
      stanceContribution: index === 5 || (departmentId === "risk" && index < 4) ? "opposes" : "supports",
      materiality: index % 2 === 0 ? "material" : "supporting",
      publicThesis: text(
        `${analysis.summary.en} ${analysis.detail.en}`,
        `${analysis.summary.ko} ${analysis.detail.ko}`,
      ),
      evidenceArtifactIds: index % 2 === 0 ? ["S01", "S02"] : ["S02", "S03"],
      counterevidenceArtifactIds: index === 5 ? ["S03"] : [],
      decisiveMetricIds: metricIds[departmentId][index] ?? [],
      falsifier:
        index === 5
          ? report.changeCondition
          : report.concerns[index % report.concerns.length] ?? report.changeCondition,
    } as unknown as EditorialClaim;
  });
  if (claims.length === 0) return report;
  return {
    ...report,
    presentationVersion: "workflow-v2",
    structuredEditorial: {
      decision: {
        stance:
          departmentId === "risk"
            ? "downside_skewed"
            : departmentId === "financial"
              ? "wait_for_proof"
              : "upside_skewed",
        confidence: "medium",
        decisiveReason: report.thesis,
        strongestCountercase: report.concerns[0] ?? report.changeCondition,
        falsifier: report.changeCondition,
        primaryClaimIds: [claims[0]!.claimId, claims.at(-1)!.claimId],
      },
      claims,
      claimRegister: [],
      comparators: [],
      conflicts: claims
        .filter((claim) => claim.counterevidenceArtifactIds.length > 0)
        .map((claim) => ({
          claimId: claim.claimId,
          counterevidenceArtifactIds: claim.counterevidenceArtifactIds,
        })),
    },
  };
}

function withFinancialProductData(report: ResearchFileData): ResearchFileData {
  if (report.metricSnapshot === undefined) return report;
  const bridgeIds = new Set([
    "revenue_ttm",
    "gross_margin",
    "operating_margin",
    "free_cash_flow",
    "capital_expenditures",
  ]);
  const templates = new Map(
    report.metricSnapshot.metrics
      .filter((metric) => bridgeIds.has(metric.id))
      .map((metric) => [metric.id, metric]),
  );
  const historicalValues: Readonly<Record<string, readonly number[]>> = {
    revenue_ttm: [60_900_000_000, 79_800_000_000, 130_500_000_000],
    gross_margin: [69.8, 73.7, 74.5],
    operating_margin: [45.9, 54.1, 61.8],
    free_cash_flow: [27_000_000_000, 39_200_000_000, 60_900_000_000],
    capital_expenditures: [1_100_000_000, 1_500_000_000, 3_200_000_000],
  };
  const periods = ["FY2024", "FY2025", "FY2026"] as const;
  const bridgeMetrics = Object.entries(historicalValues).flatMap(
    ([id, values]) => {
      const template = templates.get(id);
      if (template === undefined) return [];
      return values.map((value, index) => ({
        ...template,
        value,
        period: periods[index] ?? "FY2026",
      }));
    },
  );
  return {
    ...report,
    metricSnapshot: {
      ...report.metricSnapshot,
      metrics: [
        ...report.metricSnapshot.metrics.filter(
          (metric) => !bridgeIds.has(metric.id),
        ),
        ...bridgeMetrics,
      ],
    },
  };
}

function withRiskProductData(report: ResearchFileData): ResearchFileData {
  if ((report.structuredEditorial?.claims.length ?? 0) >= 6) return report;
  type RiskClaim = NonNullable<
    NonNullable<ResearchFileData["structuredEditorial"]>["claims"]
  >[number];
  const claimId = (value: string) => value as RiskClaim["claimId"];
  const downsideClaimId = claimId("00000000-0000-4000-8000-000000000211");
  const indicatorClaimId = claimId("00000000-0000-4000-8000-000000000212");
  const claims = [
    {
      claimId: downsideClaimId,
      decisionDimension: "downside_path" as const,
      roleOwner: "risk",
      stanceContribution: "opposes" as const,
      materiality: "material" as const,
      publicThesis: text(
        "Export restrictions and deployment delays can reinforce customer capex digestion before demand diversification absorbs the shock.",
        "수출 규제와 구축 지연이 고객 설비투자 소화와 결합해 수요 다변화가 충격을 흡수하기 전에 하방을 증폭할 수 있습니다.",
      ),
      evidenceArtifactIds: ["S01", "S02"],
      counterevidenceArtifactIds: ["S03"],
      decisiveMetricIds: ["inventory"],
      falsifier: text(
        "Escalate when export scope widens as inventory rises in the same reporting period.",
        "수출 통제 범위가 확대되는 동시에 같은 보고 기간 재고가 증가하면 단계를 상향합니다.",
      ),
    },
    {
      claimId: indicatorClaimId,
      decisionDimension: "leading_indicator" as const,
      roleOwner: "risk_policy",
      stanceContribution: "opposes" as const,
      materiality: "material" as const,
      publicThesis: text(
        "Inventory commitments reveal deployment friction before reported revenue slows.",
        "재고 약정은 보고 매출이 둔화하기 전에 구축 마찰을 드러냅니다.",
      ),
      evidenceArtifactIds: ["S02", "S03"],
      counterevidenceArtifactIds: [],
      decisiveMetricIds: ["inventory"],
      falsifier: text(
        "Watch inventory growth against deployment and customer-utilization disclosures.",
        "재고 증가를 구축 일정과 고객 가동률 공시와 대조합니다.",
      ),
    },
    {
      claimId: claimId("00000000-0000-4000-8000-000000000213"),
      decisionDimension: "downside_path" as const,
      roleOwner: "risk_policy",
      stanceContribution: "opposes" as const,
      materiality: "supporting" as const,
      publicThesis: text(
        "Customer concentration can transmit one budget reset across the revenue base.",
        "고객 집중도는 단일 예산 조정을 전체 매출 기반으로 전이시킬 수 있습니다.",
      ),
      evidenceArtifactIds: ["S01", "S03"],
      counterevidenceArtifactIds: [],
      decisiveMetricIds: [],
      falsifier: text(
        "Escalate if two major customers reduce AI capex guidance together.",
        "주요 고객 두 곳이 동시에 AI 설비투자 가이던스를 낮추면 상향합니다.",
      ),
    },
    {
      claimId: claimId("00000000-0000-4000-8000-000000000214"),
      decisionDimension: "mitigant" as const,
      roleOwner: "risk",
      stanceContribution: "supports" as const,
      materiality: "material" as const,
      publicThesis: text(
        "Cash and short-term investments preserve response capacity against an isolated shock.",
        "현금과 단기투자자산은 단일 충격에 대응할 여력을 유지합니다.",
      ),
      evidenceArtifactIds: ["S02"],
      counterevidenceArtifactIds: [],
      decisiveMetricIds: ["cash"],
      falsifier: text(
        "Reassess the buffer if cash falls while commitments rise.",
        "현금이 줄고 약정이 늘면 완충력을 재평가합니다.",
      ),
    },
  ] as unknown as RiskClaim[];
  return {
    ...report,
    structuredEditorial: {
      decision: {
        stance: "downside_skewed",
        confidence: "medium",
        decisiveReason: report.thesis,
        strongestCountercase: report.positives[0] ?? report.thesis,
        falsifier: report.changeCondition,
        primaryClaimIds: [downsideClaimId, indicatorClaimId],
      },
      claims,
      claimRegister: [],
      comparators: [],
      conflicts: claims
        .filter((claim) => claim.counterevidenceArtifactIds.length > 0)
        .map((claim) => ({
          claimId: claim.claimId,
          counterevidenceArtifactIds: claim.counterevidenceArtifactIds,
        })),
    },
  };
}
