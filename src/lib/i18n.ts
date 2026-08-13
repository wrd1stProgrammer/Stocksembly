import type { ActiveResearchActivityKind } from "../research/domain/activeResearchActivity";
import type { AgentId } from "../research/types";

const locales = ["en", "ko"] as const;

export type Locale = (typeof locales)[number];

export type ResearchCopy = {
  readonly camera: {
    readonly overview: string;
    readonly focus: string;
    readonly overviewToggle: string;
    readonly focusToggle: string;
  };
  readonly aria: {
    readonly stage: string;
    readonly semanticSummary: string;
  };
  readonly activityStatus: Readonly<Record<ActiveResearchActivityKind, string>>;
  readonly agentThinking: Readonly<Record<AgentId, string>>;
};

export const researchCopy: Readonly<Record<Locale, ResearchCopy>> = {
  en: {
    camera: {
      overview: "Overview",
      focus: "Focus",
      overviewToggle: "Show full office overview",
      focusToggle: "Follow the active research group",
    },
    aria: {
      stage: "AI research team activity",
      semanticSummary: "Current public office activity",
    },
    activityStatus: {
      data_collection: "Collecting data",
      macro_analysis: "Analyzing market conditions",
      news_analysis: "Analyzing news",
      market_comparison: "Comparing peers",
      business_analysis: "Analyzing the business",
      product_analysis: "Analyzing products",
      competition_analysis: "Analyzing competition",
      financial_analysis: "Analyzing financials",
      valuation_analysis: "Analyzing valuation",
      earnings_quality_analysis: "Testing earnings quality",
      downside_analysis: "Analyzing downside risk",
      policy_scenario_analysis: "Analyzing policy scenarios",
      team_synthesis: "Synthesizing team views",
      challenge_review: "Testing the countercase",
      followup_research: "Researching follow-ups",
      response_review: "Reviewing rebuttals",
      evidence_audit: "Auditing evidence",
      semantic_audit: "Validating claims",
      chair_synthesis: "Finalizing the decision",
    },
    agentThinking: {
      market: "Interpreting rates, inflation, and the market regime",
      market_news: "Cross-checking news flow, trend, and volume",
      benchmark: "Comparing peers and benchmark dispersion",
      company: "Mapping the business model and growth drivers",
      company_product: "Testing product adoption evidence",
      company_competition: "Comparing moat and competitive position",
      financial: "Reconciling statements and cash conversion",
      valuation: "Building valuation and expectation scenarios",
      financial_quality: "Testing earnings quality and durability",
      risk: "Tracing downside paths and early warnings",
      risk_policy: "Stress-testing policy and regulatory scenarios",
      chair: "Coordinating the evidence review",
    },
  },
  ko: {
    camera: {
      overview: "전체 보기",
      focus: "집중 보기",
      overviewToggle: "오피스 전체 보기",
      focusToggle: "현재 연구 그룹 따라가기",
    },
    aria: {
      stage: "AI 분석팀 작업 현황",
      semanticSummary: "현재 공개 오피스 활동",
    },
    activityStatus: {
      data_collection: "데이터 수집 중",
      macro_analysis: "시장 환경 분석 중",
      news_analysis: "뉴스 분석 중",
      market_comparison: "동종기업 비교 중",
      business_analysis: "사업 분석 중",
      product_analysis: "제품 분석 중",
      competition_analysis: "경쟁력 분석 중",
      financial_analysis: "재무 분석 중",
      valuation_analysis: "가치평가 중",
      earnings_quality_analysis: "이익의 질 검증 중",
      downside_analysis: "하방 위험 분석 중",
      policy_scenario_analysis: "정책 시나리오 분석 중",
      team_synthesis: "팀 의견 종합 중",
      challenge_review: "반대 논리 검토 중",
      followup_research: "추가 근거 조사 중",
      response_review: "반론 답변 검토 중",
      evidence_audit: "근거 감사 중",
      semantic_audit: "주장 검증 중",
      chair_synthesis: "최종 판단 중",
    },
    agentThinking: {
      market: "금리·물가와 시장 국면 해석 중",
      market_news: "뉴스 흐름과 추세·거래량 대조 중",
      benchmark: "동종기업과 벤치마크 편차 비교 중",
      company: "사업 구조와 성장 동력 분석 중",
      company_product: "제품 채택 근거 검증 중",
      company_competition: "경쟁우위와 시장 지위 비교 중",
      financial: "재무제표와 현금 전환 대조 중",
      valuation: "가치평가와 기대 시나리오 구성 중",
      financial_quality: "이익의 질과 지속성 검증 중",
      risk: "하방 경로와 조기 경보 추적 중",
      risk_policy: "정책·규제 시나리오 스트레스 테스트 중",
      chair: "근거 검토 절차 조율 중",
    },
  },
};

type Copy = {
  readonly a11y: {
    readonly home: string;
    readonly language: string;
    readonly navigation: string;
    readonly results: string;
  };
  readonly nav: {
    readonly product: string;
    readonly getStarted: string;
    readonly pricing: string;
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly titleLead: string;
    readonly titleTail: string;
    readonly descriptionLead: string;
    readonly descriptionTail: string;
    readonly proof: string;
  };
  readonly landing: {
    readonly sourcesLabel: string;
    readonly sources: readonly string[];
    readonly publishedTime: {
      readonly justNow: string;
      readonly minutesAgo: (minutes: number) => string;
      readonly hoursMinutesAgo: (hours: number, minutes: number) => string;
    };
  };
  readonly footer: {
    readonly purpose: string;
    readonly productHeading: string;
    readonly howItWorks: string;
    readonly research: string;
    readonly stockAnalysis: string;
    readonly standardsHeading: string;
    readonly about: string;
    readonly methodology: string;
    readonly editorialPolicy: string;
    readonly corrections: string;
    readonly contactHeading: string;
    readonly support: string;
    readonly operator: string;
    readonly legalHeading: string;
    readonly terms: string;
    readonly privacy: string;
    readonly disclaimerLabel: string;
    readonly risk: string;
    readonly disclaimer: string;
    readonly rights: string;
  };
  readonly search: {
    readonly label: string;
    readonly placeholder: string;
    readonly questionLabel: string;
    readonly questionPlaceholder: string;
    readonly action: string;
    readonly loading: string;
    readonly popular: string;
    readonly clear: string;
    readonly noResults: string;
    readonly matchHint: string;
    readonly queued: (symbol: string) => string;
  };
};

export const copy: Readonly<Record<Locale, Copy>> = {
  en: {
    a11y: {
      home: "Stocksembly home",
      language: "Language",
      navigation: "Primary navigation",
      results: "Search results",
    },
    nav: {
      product: "Product",
      getStarted: "Get started",
      pricing: "Plans",
    },
    hero: {
      eyebrow: "Multi-agent research for US equities",
      titleLead: "Test the",
      titleTail: "investment debate.",
      descriptionLead:
        "Eleven AI specialists investigate the business, valuation, catalysts, and risks behind every US stock.",
      descriptionTail:
        "One independent chair turns the debate into an evidence-linked judgment.",
      proof: "See the evidence — and the disagreement — behind the conclusion.",
    },
    landing: {
      sourcesLabel: "Research coverage",
      sources: [
        "SEC filings",
        "Earnings calls",
        "Market data",
        "Company releases",
        "Trusted news",
      ],
      publishedTime: {
        justNow: "Just now",
        minutesAgo: (minutes) => `${minutes}m ago`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours}h${minutes > 0 ? ` ${minutes}m` : ""} ago`,
      },
    },
    footer: {
      purpose:
        "AI equity research that keeps sources attached and disagreement visible.",
      productHeading: "Product",
      howItWorks: "How it works",
      research: "Start research",
      stockAnalysis: "US stock analysis",
      standardsHeading: "About & standards",
      about: "About Stocksembly",
      methodology: "Research methodology",
      editorialPolicy: "Editorial policy",
      corrections: "Corrections policy",
      contactHeading: "Contact",
      support: "Customer support",
      operator: "Operated by SERN · South Korea",
      legalHeading: "Legal",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      disclaimerLabel: "Research Disclaimer",
      risk: "Risk Disclosure",
      disclaimer:
        "AI-assisted research for informational and educational use. No buy or sell recommendations or target prices. Data and model outputs may be delayed, incomplete, or inaccurate. Investing involves risk, including loss of principal.",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "Ticker or company",
      placeholder: "Search a US ticker or company",
      questionLabel: "Investment question",
      questionPlaceholder: "e.g. Can growth justify today's valuation?",
      action: "Build research",
      loading: "Opening research room",
      popular: "Popular tickers",
      clear: "Clear search",
      noResults: "No supported US company found. Try another ticker.",
      matchHint: "Select a company or start the research directly.",
      queued: (symbol) => `${symbol} research room is ready.`,
    },
  },
  ko: {
    a11y: {
      home: "Stocksembly 홈",
      language: "언어",
      navigation: "주요 탐색",
      results: "검색 결과",
    },
    nav: {
      product: "제품",
      getStarted: "시작하기",
      pricing: "요금제",
    },
    hero: {
      eyebrow: "미국주식 AI 에이전트 팀 리서치",
      titleLead: "핵심 투자 쟁점을",
      titleTail: "검증하세요.",
      descriptionLead:
        "11명의 AI 에이전트가 사업·실적·밸류에이션·촉매와 리스크를 함께 조사합니다.",
      descriptionTail:
        "독립 리서치 의장이 반론을 검토해 근거가 연결된 최종 판단으로 정리합니다.",
      proof: "결론만 보지 말고, 근거와 반론까지 확인하세요.",
    },
    landing: {
      sourcesLabel: "리서치 범위",
      sources: [
        "SEC 공시",
        "실적 발표",
        "시장 데이터",
        "기업 발표",
        "검증된 뉴스",
      ],
      publishedTime: {
        justNow: "방금 전",
        minutesAgo: (minutes) => `${minutes}분 전`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours}시간${minutes > 0 ? ` ${minutes}분` : ""} 전`,
      },
    },
    footer: {
      purpose: "출처는 붙이고 의견 차이는 남기는 AI 주식 리서치.",
      productHeading: "제품",
      howItWorks: "작동 방식",
      research: "리서치 시작",
      stockAnalysis: "미국주식 분석",
      standardsHeading: "소개 및 원칙",
      about: "Stocksembly 소개",
      methodology: "리서치 방법론",
      editorialPolicy: "편집 원칙",
      corrections: "정정 정책",
      contactHeading: "문의",
      support: "고객 문의",
      operator: "SERN 운영 · 대한민국",
      legalHeading: "법률",
      terms: "이용약관",
      privacy: "개인정보처리방침",
      disclaimerLabel: "리서치 면책",
      risk: "위험 고지",
      disclaimer:
        "정보 및 교육 목적의 AI 보조 리서치입니다. 매매 추천이나 목표가를 제공하지 않으며 데이터와 모델 결과는 지연되거나 부정확할 수 있습니다. 투자에는 원금 손실 위험이 있습니다.",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "종목 또는 기업",
      placeholder: "미국 티커 또는 기업명 검색",
      questionLabel: "검증할 투자 질문",
      questionPlaceholder: "예: 성장률이 현재 밸류에이션을 정당화할까?",
      action: "팀 리서치 시작",
      loading: "리서치 룸을 준비하고 있습니다",
      popular: "인기 티커",
      clear: "검색어 지우기",
      noResults:
        "지원 대상인 미국 기업을 찾지 못했습니다. 다른 티커를 입력하세요.",
      matchHint: "기업을 선택하거나 바로 리서치를 시작하세요.",
      queued: (symbol) => `${symbol} 리서치 룸이 준비됐습니다.`,
    },
  },
};
