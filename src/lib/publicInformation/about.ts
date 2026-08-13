import type { PublicInformationDocument } from "./contracts";

export const aboutDocument = {
  key: "about",
  path: "/about",
  schemaType: "AboutPage",
  title: {
    en: "About Stocksembly",
    ko: "Stocksembly 소개",
  },
  description: {
    en: "What Stocksembly is, how its AI research team is organized, and where its responsibilities end.",
    ko: "Stocksembly가 제공하는 서비스, AI 리서치 팀의 구성, 그리고 책임 범위를 설명합니다.",
  },
  eyebrow: {
    en: "Company and service",
    ko: "회사 및 서비스",
  },
  updated: "2026-08-12",
  sections: [
    {
      id: "service",
      title: { en: "What we build", ko: "우리가 만드는 것" },
      paragraphs: [
        {
          en: "Stocksembly is an AI-assisted research service for US equities. It is designed to help readers investigate an investment question, inspect the evidence behind a conclusion, and see where specialist views disagree.",
          ko: "Stocksembly는 미국 주식을 위한 AI 보조 리서치 서비스입니다. 투자 질문을 조사하고, 결론의 근거를 확인하며, 전문 역할 간 의견 차이를 살펴볼 수 있도록 설계되었습니다.",
        },
        {
          en: "The service supports full-committee research and focused market, company, financial, or risk research. A user can set the investment horizon, analysis depth, counterargument intensity, decision purpose, and up to five comparison symbols.",
          ko: "전체 위원회 리서치와 시장·기업·재무·리스크 단일 팀 리서치를 지원합니다. 사용자는 투자 기간, 분석 깊이, 반론 강도, 의사결정 목적, 최대 5개의 비교 종목을 설정할 수 있습니다.",
        },
      ],
    },
    {
      id: "team",
      title: { en: "The research team", ko: "리서치 팀 구성" },
      paragraphs: [
        {
          en: "Full-committee research uses eleven AI specialist roles grouped into four departments, followed by a separate AI chair role. The display names and personas assigned to these roles are product interfaces; they are not human employees, registered analysts, or investment advisers.",
          ko: "전체 위원회 리서치는 4개 부서에 속한 11개의 AI 전문 역할과 별도의 AI 의장 역할을 사용합니다. 각 역할의 이름과 페르소나는 제품 인터페이스이며, 실제 직원·등록 애널리스트·투자자문가를 의미하지 않습니다.",
        },
      ],
      bullets: [
        {
          en: "Market: market regime, news, technical context, and qualified benchmarks",
          ko: "시장: 시장 국면, 뉴스, 기술적 맥락, 적격 벤치마크",
        },
        {
          en: "Company: business model, products, customers, competition, and execution",
          ko: "기업: 사업 모델, 제품, 고객, 경쟁, 실행력",
        },
        {
          en: "Financial: reported results, cash conversion, financial quality, and valuation",
          ko: "재무: 보고 실적, 현금 전환, 재무 품질, 밸류에이션",
        },
        {
          en: "Risk: downside paths, policy exposure, warning signals, and mitigants",
          ko: "리스크: 하방 경로, 정책 노출, 조기 경보, 완화 요인",
        },
      ],
    },
    {
      id: "output",
      title: { en: "What a report contains", ko: "보고서에 담기는 내용" },
      paragraphs: [
        {
          en: "A published report is a dated research snapshot. Depending on the available evidence and selected scope, it can include a thesis, supporting and opposing claims, team views, scenarios, comparators, observable falsifiers, data coverage, source references, unresolved questions, and limitations.",
          ko: "발행 보고서는 특정 시점의 리서치 스냅샷입니다. 확보된 근거와 선택 범위에 따라 투자 논지, 찬반 주장, 팀별 견해, 시나리오, 비교기업, 관찰 가능한 판단 변경 조건, 데이터 범위, 출처, 미확인 질문, 제한사항을 포함할 수 있습니다.",
        },
        {
          en: "Newly published reports may be available to eligible subscribers first. Reports that meet the publication status rules become publicly readable and discoverable after seven days.",
          ko: "새로 발행된 보고서는 이용 자격이 있는 구독자에게 먼저 제공될 수 있습니다. 발행 상태 요건을 충족한 보고서는 7일 후 비로그인 이용자에게 공개되고 검색엔진이 발견할 수 있는 대상이 됩니다.",
        },
      ],
    },
    {
      id: "limits",
      title: { en: "What Stocksembly is not", ko: "Stocksembly가 아닌 것" },
      paragraphs: [
        {
          en: "Stocksembly does not provide individualized investment advice, brokerage services, trade execution, guaranteed returns, or a substitute for professional legal, tax, accounting, or financial advice. AI output and source data can be incomplete, delayed, or wrong.",
          ko: "Stocksembly는 개인 맞춤 투자자문, 중개, 주문 실행, 수익 보장 또는 법률·세무·회계·재무 전문가의 조언을 대체하는 서비스를 제공하지 않습니다. AI 결과와 원천 데이터는 불완전하거나 지연되거나 틀릴 수 있습니다.",
        },
        {
          en: "Readers remain responsible for checking material facts against primary or licensed sources and for making their own decisions.",
          ko: "중요한 사실은 1차 자료 또는 적법한 데이터 출처에서 다시 확인해야 하며, 최종 의사결정의 책임은 이용자에게 있습니다.",
        },
      ],
    },
    {
      id: "operator",
      title: { en: "Operator and contact", ko: "운영자 및 문의" },
      paragraphs: [
        {
          en: "Stocksembly is operated by SERN in South Korea. Questions about the service or its published research can be sent to kicoa24@gmail.com.",
          ko: "Stocksembly는 대한민국의 SERN이 운영합니다. 서비스 또는 공개 리서치에 관한 문의는 kicoa24@gmail.com으로 보내주세요.",
        },
      ],
    },
  ],
} as const satisfies PublicInformationDocument;
