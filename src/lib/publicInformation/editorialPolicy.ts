import type { PublicInformationDocument } from "./contracts";

export const editorialPolicyDocument = {
  key: "editorial-policy",
  path: "/editorial-policy",
  schemaType: "WebPage",
  title: {
    en: "Editorial policy",
    ko: "편집 원칙",
  },
  description: {
    en: "The publication, evidence, disagreement, automation, and limitation standards applied to Stocksembly research.",
    ko: "Stocksembly 리서치에 적용되는 발행·근거·이견·자동화·제한사항 원칙을 설명합니다.",
  },
  eyebrow: {
    en: "Publication standards",
    ko: "발행 기준",
  },
  updated: "2026-08-12",
  sections: [
    {
      id: "automation",
      title: { en: "AI authorship and accountability", ko: "AI 작성과 책임" },
      paragraphs: [
        {
          en: "Stocksembly research is generated, challenged, audited, and synthesized by software-driven AI roles. Their names and visual personas do not represent human analysts. Unless a report explicitly says otherwise, readers should not assume that a human editor independently reviewed every sentence or source before publication.",
          ko: "Stocksembly 리서치는 소프트웨어로 구동되는 AI 역할이 생성·반박·감사·종합합니다. 역할의 이름과 시각적 페르소나는 실제 인간 애널리스트를 뜻하지 않습니다. 보고서에 별도 표시가 없다면 인간 편집자가 발행 전 모든 문장과 출처를 독립적으로 검토했다고 가정해서는 안 됩니다.",
        },
        {
          en: "SERN operates the service and is responsible for maintaining the product rules described here. Automation reduces neither model risk nor the reader's duty to verify material facts.",
          ko: "SERN은 서비스를 운영하며 여기에 설명된 제품 규칙을 유지할 책임이 있습니다. 자동화는 모델 위험을 없애지 않으며, 중요한 사실을 재확인해야 하는 이용자의 책임도 줄이지 않습니다.",
        },
      ],
    },
    {
      id: "evidence",
      title: { en: "Evidence and provenance", ko: "근거와 출처 계보" },
      paragraphs: [
        {
          en: "Material claims are expected to carry accepted evidence artifact identifiers. Stored evidence includes run and snapshot identity, content hashes, retrieval timing, and source locator metadata so the publication boundary can verify lineage and detect cross-run or altered content.",
          ko: "중요 주장에는 승인된 근거 아티팩트 식별자가 연결되어야 합니다. 저장 근거에는 실행·스냅샷 식별정보, 콘텐츠 해시, 수집 시점, 출처 위치정보가 포함되어 발행 경계에서 계보를 확인하고 다른 실행의 자료나 변경된 내용을 탐지할 수 있습니다.",
        },
        {
          en: "This provenance is a control, not a guarantee of truth. Regulatory filings can be amended, providers can revise data, publisher labels can be imperfect, and a cited passage can still be interpreted incorrectly.",
          ko: "출처 계보는 통제 장치이지 진실을 보장하는 장치는 아닙니다. 규제 공시는 정정될 수 있고, 제공자는 데이터를 수정할 수 있으며, 발행처 표기가 불완전하거나 인용문을 잘못 해석할 수 있습니다.",
        },
      ],
    },
    {
      id: "disagreement",
      title: {
        en: "Disagreement before consensus",
        ko: "합의보다 이견을 우선 기록",
      },
      paragraphs: [
        {
          en: "Full-committee research separates specialist memos, department consolidation, blind challenges, owner responses, ballots, audits, and chair synthesis. The process is intended to preserve opposing evidence, revisions, abstentions, open questions, and falsifiers rather than manufacture unanimous confidence.",
          ko: "전체 위원회 리서치는 전문 역할 메모, 팀 통합, 블라인드 반론, 담당 팀 응답, 투표, 감사, 의장 종합을 분리합니다. 이 과정은 만장일치처럼 보이게 만드는 대신 반대 근거, 수정, 기권, 미확인 질문, 판단 변경 조건을 보존하도록 설계되었습니다.",
        },
        {
          en: "Multiple AI roles do not constitute independent human institutions and may share model weaknesses, training biases, or source errors. Agreement among agents is not proof that a conclusion is correct.",
          ko: "여러 AI 역할은 서로 독립된 인간 기관이 아니며 모델의 약점, 학습 편향, 출처 오류를 공유할 수 있습니다. 에이전트 간 합의가 결론의 정확성을 증명하지는 않습니다.",
        },
      ],
    },
    {
      id: "quality",
      title: { en: "Publication quality rules", ko: "발행 품질 규칙" },
      paragraphs: [
        {
          en: "A report can be persisted only after the required workflow artifacts and source lineage pass structural checks. Public bilingual fields are then evaluated for evidence ownership, supported numbers, comparator typing, anticipated-question evidence, unsafe investment language, repetition, information value, and leakage of internal metadata or provider terminology.",
          ko: "필수 작업 아티팩트와 출처 계보가 구조 검사를 통과해야 보고서를 저장할 수 있습니다. 이후 공개 한·영 필드는 근거 소유권, 지원되는 숫자, 비교기업 유형, 예상 질문 근거, 위험한 투자 표현, 반복, 정보량, 내부 메타데이터나 제공자 용어 노출 여부를 검사받습니다.",
        },
        {
          en: "Hard violations block publication. Some wording or metadata issues may receive one bounded targeted rewrite, but that rewrite cannot introduce new claim identifiers, evidence identifiers, or unsupported numbers. A report may still publish with disclosed limitations or low confidence when the remaining issue is not a hard violation.",
          ko: "중대 위반은 발행을 차단합니다. 일부 문구나 메타데이터 문제에는 제한된 1회의 표적 수정이 적용될 수 있지만, 새 주장 식별자·근거 식별자·지원되지 않은 숫자를 추가할 수 없습니다. 남은 문제가 중대 위반이 아니라면 제한사항이나 낮은 신뢰도를 공개한 상태로 발행될 수 있습니다.",
        },
      ],
    },
    {
      id: "safety",
      title: {
        en: "Investment language and reader safety",
        ko: "투자 표현과 이용자 보호",
      },
      paragraphs: [
        {
          en: "Public output must not present an immediate buy or sell instruction or a guaranteed return. Stocksembly does not provide target prices or individualized recommendations. Scenario values, valuation frameworks, confidence labels, and investment actions are analytical constructs, not trade instructions.",
          ko: "공개 결과는 즉시 매수·매도 지시나 수익 보장을 제시해서는 안 됩니다. Stocksembly는 목표주가나 개인 맞춤 추천을 제공하지 않습니다. 시나리오 값, 밸류에이션 프레임, 신뢰도 라벨, 투자 행동 분류는 분석 도구이지 매매 지시가 아닙니다.",
        },
      ],
    },
    {
      id: "time",
      title: {
        en: "Time, limitations, and updates",
        ko: "시점, 제한사항, 업데이트",
      },
      paragraphs: [
        {
          en: "Every report should be read as a snapshot of the evidence available to its run. Market prices, filings, estimates, news, and company conditions can change after publication. Missing, stale, unavailable, or rights-restricted capabilities should be surfaced as coverage or limitation information where the report schema supports them.",
          ko: "모든 보고서는 해당 실행 시점에 이용 가능했던 근거의 스냅샷으로 읽어야 합니다. 시장 가격, 공시, 추정치, 뉴스, 기업 상황은 발행 후 바뀔 수 있습니다. 누락·지연·사용 불가·권리 제한 데이터는 보고서 구조가 지원하는 범위에서 데이터 범위 또는 제한사항으로 표시되어야 합니다.",
        },
        {
          en: "A change in the market is not automatically a correction to an earlier dated analysis. Factual, persistence, lineage, or projection defects are handled under the corrections policy.",
          ko: "시장 상황의 변화가 과거 시점 분석의 오류를 자동으로 의미하지는 않습니다. 사실·저장·계보·표현 변환의 결함은 정정 정책에 따라 처리합니다.",
        },
      ],
    },
  ],
} as const satisfies PublicInformationDocument;
