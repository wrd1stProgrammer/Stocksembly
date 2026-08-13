import type { PublicInformationDocument } from "./contracts";

export const correctionsDocument = {
  key: "corrections",
  path: "/corrections",
  schemaType: "WebPage",
  title: {
    en: "Corrections policy",
    ko: "정정 정책",
  },
  description: {
    en: "How to report a problem in published research and how Stocksembly handles verified report defects and version repairs.",
    ko: "공개 리서치의 문제를 신고하는 방법과 확인된 보고서 결함 및 버전 수정을 처리하는 방식을 설명합니다.",
  },
  eyebrow: {
    en: "Report an issue",
    ko: "보고서 문제 신고",
  },
  updated: "2026-08-12",
  sections: [
    {
      id: "scope",
      title: { en: "What can be reported", ko: "신고할 수 있는 문제" },
      paragraphs: [
        {
          en: "We welcome reports of material factual errors, a citation that does not support the displayed claim, ticker or issuer mismatches, incorrect units or dates, duplicated or missing text caused by presentation, undisclosed material data limitations, unsafe investment language, privacy concerns, and content that may violate source rights.",
          ko: "중대한 사실 오류, 표시된 주장을 뒷받침하지 않는 인용, 티커·발행기업 불일치, 잘못된 단위·날짜, 화면 변환 때문에 생긴 중복·누락 문구, 공개되지 않은 중대한 데이터 제한, 위험한 투자 표현, 개인정보 문제, 출처 권리를 침해할 수 있는 콘텐츠를 신고할 수 있습니다.",
        },
        {
          en: "A later price move, earnings result, filing, or news event does not by itself prove that a correctly dated report was erroneous when published. Those changes may justify new research rather than a correction.",
          ko: "이후 발생한 주가 변동, 실적 발표, 공시, 뉴스만으로는 발행 당시 시점이 정확히 표시된 보고서가 틀렸다고 단정할 수 없습니다. 이런 변화는 정정보다 새로운 리서치의 대상이 될 수 있습니다.",
        },
      ],
    },
    {
      id: "request",
      title: { en: "How to request a review", ko: "검토 요청 방법" },
      paragraphs: [
        {
          en: "Email kicoa24@gmail.com with the report URL, the exact claim or section, the reason you believe it is wrong, and a primary or otherwise reliable source when available. Do not send account passwords, payment-card data, brokerage credentials, or other unnecessary sensitive information.",
          ko: "보고서 URL, 문제가 있다고 보는 정확한 주장 또는 섹션, 오류라고 판단한 이유, 가능한 경우 1차 자료 또는 신뢰할 수 있는 출처를 kicoa24@gmail.com으로 보내주세요. 계정 비밀번호, 결제카드 정보, 증권사 인증정보 등 불필요한 민감정보는 보내지 마세요.",
        },
      ],
    },
    {
      id: "review",
      title: { en: "Review standard", ko: "검토 기준" },
      paragraphs: [
        {
          en: "A report is compared with its stored run, snapshot, source artifacts, citation locators, content hashes, accepted claim lineage, and published payload. We distinguish source-data changes from model interpretation errors, and original research defects from later events.",
          ko: "신고된 보고서는 저장된 실행, 스냅샷, 출처 아티팩트, 인용 위치정보, 콘텐츠 해시, 승인된 주장 계보, 공개 페이로드와 비교합니다. 원천 데이터의 사후 변경과 모델 해석 오류, 원래 리서치 결함과 이후 사건을 구분합니다.",
        },
        {
          en: "The service does not currently promise a fixed response time, continuous post-publication monitoring, or acceptance of every requested change. A request may be declined when the supplied evidence does not establish a defect.",
          ko: "현재 서비스는 고정된 응답 기한, 발행 후 상시 모니터링, 모든 정정 요청의 수용을 보장하지 않습니다. 제출된 근거로 결함을 확인할 수 없는 경우 요청이 받아들여지지 않을 수 있습니다.",
        },
      ],
    },
    {
      id: "versioning",
      title: { en: "Versioned repair", ko: "버전 기반 수정" },
      paragraphs: [
        {
          en: "Published report artifacts are not silently overwritten. The current persistence path supports an authorized repair as a newer report version derived from the prior report and authenticated workflow artifacts. The repair must use the same report and run identity, name the superseded version, carry authorization and lineage metadata, and pass the saved editorial authority and publication gate again.",
          ko: "발행된 보고서 아티팩트는 조용히 덮어쓰지 않습니다. 현재 저장 경로는 이전 보고서와 인증된 작업 아티팩트에서 파생된 새 보고서 버전으로 승인된 수정을 저장할 수 있습니다. 수정본은 동일한 보고서·실행 식별정보를 사용하고, 대체하는 버전을 명시하며, 승인·계보 메타데이터를 포함하고, 저장된 편집 권한과 발행 게이트를 다시 통과해야 합니다.",
        },
        {
          en: "The public catalog and sitemap select the absolute latest stored report version. If a newer version is incomplete or fails the required status checks, the report is not treated as an eligible current publication merely because an older version was complete.",
          ko: "공개 카탈로그와 sitemap은 저장된 절대 최신 보고서 버전을 선택합니다. 새 버전이 미완료이거나 필수 상태 검사를 통과하지 못하면, 이전 버전이 완료 상태였다는 이유만으로 현재 발행본으로 취급하지 않습니다.",
        },
      ],
    },
    {
      id: "transparency",
      title: { en: "Current transparency limits", ko: "현재 정정 공개 범위" },
      paragraphs: [
        {
          en: "Stocksembly does not yet provide a public correction-request form or a standalone public correction ledger. Version and lineage data are retained in the report system, but not every internal repair field is currently displayed to readers. This page will be updated if those surfaces change.",
          ko: "Stocksembly는 아직 공개 정정 요청 양식이나 별도의 공개 정정 원장을 제공하지 않습니다. 버전과 계보 데이터는 보고서 시스템에 보존되지만 모든 내부 수정 필드가 현재 이용자 화면에 표시되는 것은 아닙니다. 관련 화면이 바뀌면 이 페이지도 업데이트합니다.",
        },
      ],
    },
  ],
} as const satisfies PublicInformationDocument;
