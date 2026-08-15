import type { ResearchLocale } from "../lib/i18n";

export type LocalizedText = Readonly<Record<ResearchLocale, string>>;

const text = (en: string, ko: string): LocalizedText => ({ en, ko });

export const researchFileFixture = {
  researchDirection: "Focus on margin durability and competitive pressure",
  marketSnapshot: {
    price: "172.41",
    currency: "USD",
    observedAt: "2026-07-20T16:00:00.000Z",
    marketState: "OPEN",
  },
  qualityScorecard: {
    evidenceCoverage: 86,
    freshnessCoverage: 92,
    rebuttalResolution: 81,
  },
  claimMatrix: [
    {
      id: "C01",
      claim: text(
        "Data-center demand remains broad across major customers.",
        "데이터센터 수요는 주요 고객 전반에서 견조합니다.",
      ),
      verdict: "entailed",
      sourceCount: 4,
      sourceRefs: ["S01", "S02"],
      strength: "strong",
    },
    {
      id: "C02",
      claim: text(
        "Premium margins can persist through the next product cycle.",
        "프리미엄 마진은 다음 제품 사이클까지 유지될 수 있습니다.",
      ),
      verdict: "partial",
      sourceCount: 3,
      sourceRefs: ["S01", "S03"],
      strength: "moderate",
    },
    {
      id: "C03",
      claim: text(
        "The current price already discounts uninterrupted execution.",
        "현재 가격은 차질 없는 실행을 상당 부분 선반영합니다.",
      ),
      verdict: "entailed",
      sourceCount: 5,
      sourceRefs: ["S03", "S04"],
      strength: "strong",
    },
  ],
  evidenceIndex: [
    {
      id: "S01",
      publisher: "NVIDIA",
      title: "FY27 Q1 earnings release",
      sourceClass: "company_filing",
      observedAt: "2026-05-21T20:00:00.000Z",
      freshness: "current",
    },
    {
      id: "S02",
      publisher: "SEC",
      title: "Quarterly report and company facts",
      sourceClass: "official_filing",
      observedAt: "2026-05-22T20:00:00.000Z",
      freshness: "current",
    },
    {
      id: "S03",
      publisher: "NVIDIA",
      title: "Earnings call transcript",
      sourceClass: "company_transcript",
      observedAt: "2026-05-21T20:00:00.000Z",
      freshness: "current",
    },
    {
      id: "S04",
      publisher: "Nasdaq",
      title: "Market observation",
      sourceClass: "market_data",
      observedAt: "2026-07-20T16:00:00.000Z",
      freshness: "current",
    },
  ],
  coverage: [
    {
      label: "official filings",
      provider: "SEC",
      status: "available",
      period: "2025-05-22–2026-05-22",
    },
    {
      label: "market observation",
      provider: "Nasdaq",
      status: "available",
      period: "2026-07-20 16:00 UTC",
    },
    {
      label: "peer evidence",
      provider: "Public filings",
      status: "available",
      period: "FY2026",
    },
  ],
  teamViews: [
    {
      departmentId: "market",
      representativeId: "market",
      teamName: text("Market team · Maya", "시장 팀 · Maya"),
      position: text(
        "AI infrastructure demand remains constructive.",
        "AI 인프라 수요는 견조합니다.",
      ),
      vote: "support_with_reservations",
      rationale: text(
        "Macro sensitivity keeps the team selective.",
        "거시 민감도를 고려해 선별적 접근이 필요합니다.",
      ),
    },
    {
      departmentId: "company",
      representativeId: "company",
      teamName: text("Company team · Ethan", "기업 팀 · Ethan"),
      position: text(
        "The product ecosystem supports durable switching costs.",
        "제품 생태계가 지속적인 전환 비용을 뒷받침합니다.",
      ),
      vote: "support",
      rationale: text(
        "Operating evidence is consistent across product lines.",
        "제품군 전반의 영업 근거가 일관됩니다.",
      ),
    },
    {
      departmentId: "financial",
      representativeId: "financial",
      teamName: text("Financial team · Noah", "재무 팀 · Noah"),
      position: text(
        "Growth and margins remain strong.",
        "성장성과 마진은 여전히 강합니다.",
      ),
      vote: "support_with_reservations",
      rationale: text(
        "Premium expectations leave limited room for misses.",
        "높은 기대치로 인해 실적 오차 허용 범위가 작습니다.",
      ),
    },
    {
      departmentId: "risk",
      representativeId: "risk",
      teamName: text("Risk team · Liam", "리스크 팀 · Liam"),
      position: text(
        "Concentration and policy risks remain material.",
        "집중도와 정책 리스크가 여전히 중요합니다.",
      ),
      vote: "abstain",
      rationale: text(
        "The next filing must resolve key unknowns.",
        "다음 공시에서 핵심 미확인 사항을 확인해야 합니다.",
      ),
    },
  ] as const,
  posture: "neutral",
  postureLabel: text("Neutral", "중립"),
  limitationNote: text(
    "This is an evidence posture, not a trading recommendation.",
    "이는 근거 수준의 판단이며 매매 추천이 아닙니다.",
  ),
  evidenceScore: { passed: 19, denominator: 22 },
  sourceCount: 14,
  claimCount: 22,
  asOf: text("July 20, 2026 · 16:00 UTC", "2026년 7월 20일 · 16:00 UTC"),
  freshness: text(
    "Filings 42d · Price 15m · News 2h",
    "공시 42일 · 가격 15분 · 뉴스 2시간",
  ),
  condition: text(
    "Strong business · demanding expectations",
    "강한 사업 · 높은 기대치",
  ),
  expectation: text(
    "The price assumes durable AI infrastructure growth and premium margins.",
    "현재 가격은 AI 인프라의 장기 성장과 높은 마진 유지를 가정합니다.",
  ),
  valuation: text(
    "Premium to peers and its own five-year range",
    "동종기업 및 5년 범위 대비 프리미엄",
  ),
  nextEvent: text(
    "FY27 Q2 results · August 26, 2026",
    "FY27 2분기 실적 · 2026년 8월 26일",
  ),
  thesis: text(
    "Business quality remains strong, but the current valuation requires sustained data-center growth and gross-margin discipline.",
    "사업 경쟁력은 강하지만 현재 가격은 데이터센터 성장과 총마진의 지속을 요구합니다.",
  ),
  changeCondition: text(
    "Reassess if data-center growth falls below 30%, gross margin drops below 72%, or software revenue scales faster than expected.",
    "데이터센터 성장률이 30% 아래로 내려가거나 총마진이 72%를 하회할 때, 또는 소프트웨어 매출이 예상보다 빠르게 확대될 때 판단을 다시 검토합니다.",
  ),
  positives: [
    text(
      "CUDA ecosystem sustains high switching costs",
      "CUDA 생태계가 높은 전환 비용을 유지",
    ),
    text(
      "Data-center demand remains broad across customers",
      "데이터센터 수요가 고객군 전반에서 견조",
    ),
    text(
      "Software mix can deepen recurring economics",
      "소프트웨어 믹스가 반복 매출 구조를 강화",
    ),
  ],
  concerns: [
    text(
      "Valuation leaves little room for execution misses",
      "밸류에이션이 실행 오차를 거의 허용하지 않음",
    ),
    text(
      "Export controls can narrow accessible demand",
      "수출 규제가 접근 가능한 수요를 제한할 수 있음",
    ),
    text(
      "Customer capex concentration raises cycle risk",
      "고객 투자 집중도가 사이클 위험을 높임",
    ),
  ],
  analysis: [
    {
      title: text("Business & moat", "사업과 경쟁력"),
      summary: text(
        "Platform depth remains the core advantage.",
        "플랫폼 깊이가 핵심 경쟁우위입니다.",
      ),
      detail: text(
        "Developer tooling, networking, and systems software reinforce hardware adoption.",
        "개발 도구·네트워킹·시스템 소프트웨어가 하드웨어 채택을 강화합니다.",
      ),
    },
    {
      title: text("Financial trend", "재무 추세"),
      summary: text(
        "Growth is exceptional; durability matters more now.",
        "성장은 탁월하며 이제 지속성이 더 중요합니다.",
      ),
      detail: text(
        "Watch data-center growth, gross margin, inventory, and customer concentration together.",
        "데이터센터 성장률·총마진·재고·고객 집중도를 함께 봅니다.",
      ),
    },
    {
      title: text("Valuation & peers", "밸류에이션과 동종기업"),
      summary: text(
        "The premium embeds another strong execution cycle.",
        "프리미엄은 추가적인 강한 실행 사이클을 반영합니다.",
      ),
      detail: text(
        "Forward multiples remain above semiconductor and platform peers after growth normalization.",
        "성장률 정상화 이후에도 선행 배수는 반도체·플랫폼 동종기업보다 높습니다.",
      ),
    },
    {
      title: text("Price & volatility", "가격 흐름과 변동성"),
      summary: text(
        "Momentum is positive but expectation-sensitive.",
        "모멘텀은 긍정적이나 기대치에 민감합니다.",
      ),
      detail: text(
        "Earnings gaps and policy headlines remain the largest short-horizon volatility drivers.",
        "실적 갭과 정책 뉴스가 단기 변동성의 가장 큰 요인입니다.",
      ),
    },
    {
      title: text("Catalysts & schedule", "촉매와 일정"),
      summary: text(
        "Results and product cadence are the next proof points.",
        "실적과 제품 출시 주기가 다음 검증 지점입니다.",
      ),
      detail: text(
        "Q2 results, Blackwell ramp, sovereign AI orders, and export-rule updates lead the calendar.",
        "2분기 실적·Blackwell 증산·소버린 AI 주문·수출 규정 변경이 핵심 일정입니다.",
      ),
    },
    {
      title: text("Expectation gap", "시장 기대와 현실의 차이"),
      summary: text(
        "Consensus is strong; upside needs evidence beyond hardware.",
        "컨센서스가 강해 추가 상승에는 하드웨어 이상의 근거가 필요합니다.",
      ),
      detail: text(
        "Software monetization and margin resilience are the clearest routes to positive surprise.",
        "소프트웨어 수익화와 마진 방어가 긍정적 서프라이즈의 핵심 경로입니다.",
      ),
    },
  ],
  scenarios: [
    {
      id: "bull",
      label: text("Bull", "강세"),
      probability: "25%",
      thesis: text(
        "AI demand compounds and software mix expands.",
        "AI 수요가 누적되고 소프트웨어 믹스가 확대됩니다.",
      ),
      assumptions: [
        {
          kind: "metric",
          metric: text("Revenue growth", "매출 성장률"),
          displayValue: text("+52%", "+52%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Gross margin", "총마진"),
          displayValue: text("75%", "75%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Diluted EPS", "희석 EPS"),
          displayValue: text("$6.42 per share", "주당 $6.42"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
      ],
    },
    {
      id: "base",
      label: text("Base", "기본"),
      probability: "50%",
      thesis: text(
        "Growth normalizes while margins stay resilient.",
        "성장은 정상화되고 마진은 견조하게 유지됩니다.",
      ),
      assumptions: [
        {
          kind: "metric",
          metric: text("Revenue growth", "매출 성장률"),
          displayValue: text("+38%", "+38%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Gross margin", "총마진"),
          displayValue: text("73%", "73%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Diluted EPS", "희석 EPS"),
          displayValue: text("$5.58 per share", "주당 $5.58"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
      ],
    },
    {
      id: "bear",
      label: text("Bear", "약세"),
      probability: "25%",
      thesis: text(
        "Capex digestion and policy friction compress expectations.",
        "투자 소화와 정책 마찰이 기대치를 낮춥니다.",
      ),
      assumptions: [
        {
          kind: "metric",
          metric: text("Revenue growth", "매출 성장률"),
          displayValue: text("+18%", "+18%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Gross margin", "총마진"),
          displayValue: text("69%", "69%"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
        {
          kind: "metric",
          metric: text("Diluted EPS", "희석 EPS"),
          displayValue: text("$4.31 per share", "주당 $4.31"),
          basis: text("FY2027 scenario", "FY2027 시나리오"),
          sourceRefs: ["S01"],
        },
      ],
    },
  ],
  appendix: [
    {
      title: text("Department positions", "부서별 원래 주장"),
      items: [
        text(
          "Market: demand regime remains constructive",
          "시장: 수요 국면은 여전히 긍정적",
        ),
        text(
          "Company: ecosystem depth protects the moat",
          "기업: 생태계 깊이가 경쟁우위를 보호",
        ),
        text(
          "Financial: quality is high, concentration needs monitoring",
          "재무: 이익의 질은 높지만 집중도 관찰 필요",
        ),
        text(
          "Risk: policy and capex digestion cap the upside",
          "리스크: 정책과 투자 소화가 상승 여력을 제한",
        ),
      ],
    },
    {
      title: text("Challenges & unresolved", "반론과 미합의 쟁점"),
      items: [
        text(
          "Strongest counter: hyperscaler spend may be pulled forward",
          "가장 강한 반론: 하이퍼스케일러 투자가 선반영됐을 가능성",
        ),
        text(
          "Unresolved: software revenue disclosure remains limited",
          "미합의: 소프트웨어 매출 공시가 제한적",
        ),
        text(
          "Open question: sustainable China replacement demand",
          "미해결: 중국 대체 수요의 지속 가능성",
        ),
      ],
    },
    {
      title: text("Audit decisions", "감사 결정"),
      items: [
        text(
          "Removed: unverified sovereign order estimate",
          "제거: 검증되지 않은 소버린 주문 추정치",
        ),
        text(
          "19 of 22 material claims passed source audit",
          "핵심 주장 22개 중 19개가 출처 감사 통과",
        ),
        text(
          "Chair: retain premium-quality thesis with explicit triggers",
          "의장: 명시적 판단 변경 조건과 함께 프리미엄 품질 논지 유지",
        ),
      ],
    },
  ],
  versions: [
    {
      version: "v1.0",
      date: "2026-06-04",
      label: text("Initial analysis", "최초 분석"),
    },
    {
      version: "v1.1",
      date: "2026-06-26",
      label: text("Material news update", "주요 뉴스 업데이트"),
    },
    {
      version: "v1.2",
      date: "2026-07-20",
      label: text("Current · expectation reset", "현재 · 기대치 재조정"),
    },
  ],
} as const;
