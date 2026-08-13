import type { Locale } from "../i18n";

// allow: SIZE_OK — localized landing-page copy is a typed, reviewable data table.

export const US_STOCK_ANALYSIS_PATHS = {
  en: "/en/us-stock-analysis",
  ko: "/ko/us-stock-analysis",
} as const satisfies Readonly<Record<Locale, string>>;

type AnalysisCard = Readonly<{
  title: string;
  description: string;
}>;

type AnalysisStep = AnalysisCard &
  Readonly<{
    number: string;
  }>;

type UsStockAnalysisCopy = Readonly<{
  metadata: Readonly<{
    title: string;
    description: string;
  }>;
  hero: Readonly<{
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: string;
    secondaryAction: string;
    proof: readonly string[];
  }>;
  analysis: Readonly<{
    eyebrow: string;
    title: string;
    description: string;
    cards: readonly AnalysisCard[];
  }>;
  committee: Readonly<{
    eyebrow: string;
    title: string;
    description: string;
    teams: readonly AnalysisCard[];
  }>;
  process: Readonly<{
    eyebrow: string;
    title: string;
    steps: readonly AnalysisStep[];
    methodologyAction: string;
  }>;
  standards: Readonly<{
    eyebrow: string;
    title: string;
    description: string;
    points: readonly string[];
    editorialAction: string;
  }>;
  questions: Readonly<{
    eyebrow: string;
    title: string;
    items: readonly AnalysisCard[];
  }>;
  closing: Readonly<{
    title: string;
    description: string;
    action: string;
  }>;
}>;

export const usStockAnalysisCopy = {
  ko: {
    metadata: {
      title: "미국주식 AI 분석 | 팀 리서치 Stocksembly",
      description:
        "11개 AI 전문 역할이 SEC 공시, 실적, 시장 데이터, 밸류에이션과 리스크를 교차 검토합니다. 근거와 반론이 함께 보이는 미국주식 분석을 시작하세요.",
    },
    hero: {
      eyebrow: "미국주식 AI 팀 리서치",
      title: "미국주식 분석, 한 명의 AI가 아니라 리서치 팀으로",
      description:
        "Stocksembly는 시장·기업·재무·리스크 관점의 11개 AI 전문 역할이 같은 투자 질문을 나누어 조사하고, 반론과 감사를 거친 뒤 하나의 근거 중심 보고서로 정리합니다.",
      primaryAction: "미국주식 분석 시작",
      secondaryAction: "공개 리서치 보기",
      proof: [
        "SEC 공시·실적·시장 데이터",
        "근거와 반론을 함께 표시",
        "발행 7일 후 공개 리서치",
      ],
    },
    analysis: {
      eyebrow: "분석 범위",
      title: "종목 검색을 넘어 투자 질문을 검증합니다",
      description:
        "티커와 질문을 입력하면 사업의 질부터 기대가 반영된 가격, 다음 촉매와 하방 위험까지 선택한 투자 기간과 분석 깊이에 맞춰 조사합니다.",
      cards: [
        {
          title: "사업과 경쟁력",
          description:
            "사업 모델, 제품, 고객, 경쟁 구도와 실행력을 공시와 기업 자료에 연결해 살펴봅니다.",
        },
        {
          title: "실적과 재무 품질",
          description:
            "매출·이익·현금흐름과 재투자 부담을 구분하고 숫자가 투자 논지에 미치는 영향을 설명합니다.",
        },
        {
          title: "밸류에이션과 비교기업",
          description:
            "자격을 확인한 비교 대상과 시장 기대를 함께 검토하며, 비교 근거가 부족하면 그 한계를 공개합니다.",
        },
        {
          title: "촉매와 리스크",
          description:
            "실적 일정, 뉴스, 정책 변화와 하방 경로를 확인하고 판단이 바뀌는 관찰 조건을 남깁니다.",
        },
      ],
    },
    committee: {
      eyebrow: "11개 전문 역할 · 4개 팀",
      title: "같은 자료를 서로 다른 책임 범위에서 검토합니다",
      description:
        "여러 역할의 동의만으로 결론을 만들지 않습니다. 각 팀은 자신의 분석 범위를 맡고, 전체 위원회 리서치에서는 팀 간 반론과 투표를 거칩니다.",
      teams: [
        {
          title: "시장팀",
          description: "시장 국면, 뉴스, 가격 흐름, 벤치마크와 금리 민감도",
        },
        {
          title: "기업팀",
          description: "사업 모델, 제품, 고객, 경쟁 우위와 실행 위험",
        },
        {
          title: "재무팀",
          description: "보고 실적, 현금 전환, 재무 품질과 밸류에이션",
        },
        {
          title: "리스크팀",
          description: "하방 시나리오, 정책 노출, 경고 신호와 완화 요인",
        },
      ],
    },
    process: {
      eyebrow: "리서치 과정",
      title: "질문에서 발행 보고서까지",
      steps: [
        {
          number: "01",
          title: "질문과 옵션 설정",
          description:
            "투자 기간, 분석 깊이, 반론 강도, 의사결정 목적과 비교 종목을 설정합니다.",
        },
        {
          number: "02",
          title: "근거 수집과 역할별 분석",
          description:
            "가용한 공시·재무·시장·뉴스 자료를 시점이 고정된 스냅샷으로 수집해 전문 역할별로 분석합니다.",
        },
        {
          number: "03",
          title: "반론과 근거 감사",
          description:
            "팀 결론을 블라인드로 반박하고, 주장과 출처의 구조·의미 일치 여부를 검사합니다.",
        },
        {
          number: "04",
          title: "의장 종합과 발행 게이트",
          description:
            "가장 강한 근거와 반대 논리, 판단 변경 조건, 신뢰도와 제한사항을 포함해 최종 보고서를 만듭니다.",
        },
      ],
      methodologyAction: "전체 리서치 방법론 확인",
    },
    standards: {
      eyebrow: "근거 중심 설계",
      title: "결론보다 결론을 만든 기록을 남깁니다",
      description:
        "Stocksembly의 분석은 매매 지시나 수익 보장이 아닙니다. 발행 보고서는 특정 시점의 AI 보조 리서치이며, 중요한 사실은 원문 자료에서 다시 확인해야 합니다.",
      points: [
        "중요 주장에 출처 식별자와 데이터 기준시점을 연결합니다.",
        "불완전·지연·사용 불가·권리 제한 데이터는 제한사항으로 전달합니다.",
        "근거 없는 숫자와 즉시 매수·매도 또는 수익 보장 표현은 발행을 차단합니다.",
        "발행 상태를 충족한 보고서는 만 7일 후 비로그인 이용자에게 공개됩니다.",
      ],
      editorialAction: "편집 원칙 확인",
    },
    questions: {
      eyebrow: "자주 묻는 질문",
      title: "미국주식 AI 분석을 시작하기 전에",
      items: [
        {
          title: "어떤 종목을 분석할 수 있나요?",
          description:
            "현재 지원되는 미국 상장 종목을 티커 또는 기업명으로 찾아 분석할 수 있습니다.",
        },
        {
          title: "리서치를 무료로 볼 수 있나요?",
          description:
            "발행 직후 보고서는 구독자에게 먼저 제공될 수 있으며, 공개 요건을 충족한 보고서는 만 7일 후 누구나 열람할 수 있습니다.",
        },
        {
          title: "매수·매도 추천이나 목표가를 제공하나요?",
          description:
            "아니요. 투자 질문을 검토하는 정보·교육 목적의 리서치이며 개인 맞춤 투자자문, 매매 지시 또는 목표가를 제공하지 않습니다.",
        },
      ],
    },
    closing: {
      title: "검증할 미국주식 투자 질문이 있나요?",
      description:
        "티커와 질문을 입력하고 전체 위원회 또는 한 개 전문팀을 선택해 리서치를 시작하세요.",
      action: "팀 리서치 시작",
    },
  },
  en: {
    metadata: {
      title: "AI Stock Analysis for US Equities | Stocksembly",
      description:
        "Eleven AI specialist roles examine SEC filings, earnings, market data, valuation, and risk. Start evidence-linked US stock analysis with the countercase included.",
    },
    hero: {
      eyebrow: "AI team research for US equities",
      title: "US stock analysis built as a research committee",
      description:
        "Stocksembly assigns one investment question to eleven AI specialist roles across market, company, financial, and risk teams. Their evidence, challenges, and audits are synthesized into one research report.",
      primaryAction: "Start US stock analysis",
      secondaryAction: "Browse public research",
      proof: [
        "SEC filings, earnings, and market data",
        "Evidence and counterarguments together",
        "Published research opens after seven days",
      ],
    },
    analysis: {
      eyebrow: "Research coverage",
      title: "Go beyond a ticker lookup and test an investment question",
      description:
        "Enter a ticker and a question to examine business quality, expectations embedded in valuation, upcoming catalysts, and downside risk for your selected horizon and depth.",
      cards: [
        {
          title: "Business and competition",
          description:
            "Connect the business model, products, customers, competition, and execution to filings and company evidence.",
        },
        {
          title: "Earnings and financial quality",
          description:
            "Separate revenue, profit, cash conversion, and reinvestment burden, then explain why the numbers matter.",
        },
        {
          title: "Valuation and comparators",
          description:
            "Review qualified comparisons and market expectations, while disclosing when reliable comparison evidence is unavailable.",
        },
        {
          title: "Catalysts and risk",
          description:
            "Track earnings, news, policy exposure, and downside paths with observable conditions that could change the view.",
        },
      ],
    },
    committee: {
      eyebrow: "11 specialist roles · 4 teams",
      title: "The same evidence, reviewed through separate responsibilities",
      description:
        "Agreement between agents is not treated as proof. Each team owns a different research boundary, and full-committee runs add cross-team challenges and ballots.",
      teams: [
        {
          title: "Market team",
          description:
            "Market regime, news, price context, benchmarks, and rate sensitivity",
        },
        {
          title: "Company team",
          description:
            "Business model, products, customers, competition, and execution risk",
        },
        {
          title: "Financial team",
          description:
            "Reported results, cash conversion, financial quality, and valuation",
        },
        {
          title: "Risk team",
          description:
            "Downside scenarios, policy exposure, warning signals, and mitigants",
        },
      ],
    },
    process: {
      eyebrow: "Research process",
      title: "From investor question to published report",
      steps: [
        {
          number: "01",
          title: "Set the question and options",
          description:
            "Choose the horizon, analysis depth, counterargument intensity, decision purpose, and comparison symbols.",
        },
        {
          number: "02",
          title: "Collect evidence and analyze by role",
          description:
            "Available filing, financial, market, and news evidence is sealed into a dated snapshot and routed to specialist roles.",
        },
        {
          number: "03",
          title: "Challenge claims and audit evidence",
          description:
            "Department positions are challenged blind, then structural and semantic audits test claim-to-source integrity.",
        },
        {
          number: "04",
          title: "Chair synthesis and publication gate",
          description:
            "The final report carries the decisive evidence, strongest countercase, falsifier, confidence, and limitations.",
        },
      ],
      methodologyAction: "Read the full methodology",
    },
    standards: {
      eyebrow: "Evidence-led by design",
      title: "Keep the record behind the conclusion",
      description:
        "Stocksembly analysis is not a trade instruction or a promise of returns. Every report is dated AI-assisted research, and material facts should be checked against original sources.",
      points: [
        "Material claims retain source identifiers and an evidence cutoff.",
        "Missing, stale, unavailable, or rights-restricted data is carried into limitations.",
        "Unsupported numbers and immediate buy, sell, or guaranteed-return language block publication.",
        "Eligible reports become readable without signing in after seven full days.",
      ],
      editorialAction: "Read the editorial policy",
    },
    questions: {
      eyebrow: "Common questions",
      title: "Before you start AI stock analysis",
      items: [
        {
          title: "Which stocks can I analyze?",
          description:
            "Search supported US-listed companies by ticker or company name and start from a specific investment question.",
        },
        {
          title: "Can I read research for free?",
          description:
            "New reports may be available to subscribers first. Reports that meet public eligibility rules open to everyone after seven full days.",
        },
        {
          title: "Does Stocksembly issue buy calls or price targets?",
          description:
            "No. The service provides informational and educational research, not individualized advice, trade instructions, or target prices.",
        },
      ],
    },
    closing: {
      title: "Have a US stock question worth testing?",
      description:
        "Enter a ticker and investment question, then choose the full committee or one focused research team.",
      action: "Start team research",
    },
  },
} as const satisfies Readonly<Record<Locale, UsStockAnalysisCopy>>;
