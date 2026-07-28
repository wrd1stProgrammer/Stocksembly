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
  };
  readonly footer: {
    readonly purpose: string;
    readonly productHeading: string;
    readonly howItWorks: string;
    readonly research: string;
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
    },
    hero: {
      eyebrow: "AI equity research, with opposing views",
      titleLead: "See the whole",
      titleTail: "company.",
      descriptionLead:
        "Eleven specialists across four departments investigate the evidence.",
      descriptionTail:
        "An independent research chair leads challenge and synthesis.",
      proof: "Evidence linked. Disagreement preserved.",
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
    },
    footer: {
      purpose:
        "AI equity research that keeps sources attached and disagreement visible.",
      productHeading: "Product",
      howItWorks: "How it works",
      research: "Start research",
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
      label: "Company or ticker",
      placeholder: "Search ticker or company",
      questionLabel: "Research question",
      questionPlaceholder: "What should the agents investigate?",
      action: "Start research",
      loading: "Starting research",
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
    },
    hero: {
      eyebrow: "서로 반박하는 AI 주식 리서치",
      titleLead: "기업의 모든 면을",
      titleTail: "보세요.",
      descriptionLead: "4개 부서의 전문가 11명이 근거를 조사합니다.",
      descriptionTail: "독립 리서치 의장이 반론과 종합을 이끕니다.",
      proof: "근거는 연결하고, 의견 차이는 남깁니다.",
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
    },
    footer: {
      purpose: "출처는 붙이고 의견 차이는 남기는 AI 주식 리서치.",
      productHeading: "제품",
      howItWorks: "작동 방식",
      research: "리서치 시작",
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
      label: "기업 또는 티커",
      placeholder: "미국 티커 또는 기업명 검색",
      questionLabel: "이번 리서치 쟁점",
      questionPlaceholder: "에이전트들이 검증할 질문을 입력하세요",
      action: "리서치 시작",
      loading: "리서치 준비 중",
      popular: "인기 티커",
      clear: "검색어 지우기",
      noResults:
        "지원 대상인 미국 기업을 찾지 못했습니다. 다른 티커를 입력하세요.",
      matchHint: "기업을 선택하거나 바로 리서치를 시작하세요.",
      queued: (symbol) => `${symbol} 리서치 룸이 준비됐습니다.`,
    },
  },
};
