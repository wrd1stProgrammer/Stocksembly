import type { PublicInformationDocument } from "./contracts";

export const methodologyDocument = {
  key: "methodology",
  path: "/methodology",
  schemaType: "WebPage",
  title: {
    en: "Research methodology",
    ko: "리서치 방법론",
  },
  description: {
    en: "How Stocksembly collects evidence, separates specialist roles, challenges claims, audits evidence, and publishes a report.",
    ko: "Stocksembly가 근거를 수집하고, 전문 역할을 분리하고, 주장을 반박·감사한 뒤 보고서를 발행하는 과정을 설명합니다.",
  },
  eyebrow: {
    en: "Evidence to publication",
    ko: "근거 수집부터 발행까지",
  },
  updated: "2026-08-12",
  sections: [
    {
      id: "scope",
      title: {
        en: "1. Define the research mandate",
        ko: "1. 리서치 범위 설정",
      },
      paragraphs: [
        {
          en: "A run begins with a supported US ticker and an investment question. The user may choose the full committee or one of four focused teams, then set a short-, medium-, or long-term horizon; core, standard, or deep analysis; standard or strong counterargument intensity; and a decision purpose such as a new entry, holding review, position sizing, or earnings review.",
          ko: "리서치는 지원되는 미국 주식 티커와 투자 질문으로 시작합니다. 사용자는 전체 위원회 또는 4개 단일 팀 중 하나를 선택하고, 단기·중기·장기 투자 기간, 핵심·표준·심층 분석, 표준·강한 반론 강도, 신규 진입·보유 검토·포지션 규모·실적 검토 등의 의사결정 목적을 설정할 수 있습니다.",
        },
        {
          en: "Up to five comparison symbols can be supplied. A company named explicitly in the question may also be recovered as a comparison symbol, but the system does not invent an unnamed peer at this boundary.",
          ko: "최대 5개의 비교 종목을 지정할 수 있습니다. 질문에 명시된 기업은 비교 종목으로 보완될 수 있지만, 이 입력 단계에서 언급되지 않은 비교기업을 임의로 만들어내지는 않습니다.",
        },
      ],
    },
    {
      id: "collection",
      title: {
        en: "2. Collect and seal evidence",
        ko: "2. 근거 수집 및 스냅샷 고정",
      },
      paragraphs: [
        {
          en: "The collection layer resolves issuer identity and builds a timestamped evidence snapshot. Depending on availability, it can include SEC filings and company facts, current reports and amendment lineage, insider and beneficial-ownership filings, BLS macro series, US Treasury yield data, and configured provider data such as quotes, price bars, fundamentals, peers, documents, calendars, and categorized news.",
          ko: "수집 계층은 발행기업 식별정보를 확인하고 시점이 기록된 근거 스냅샷을 만듭니다. 가용성에 따라 SEC 공시와 기업 재무 사실, 수시공시와 정정 계보, 내부자·주요주주 공시, 미국 노동통계국 거시지표, 미 재무부 금리 데이터, 그리고 설정된 제공자의 시세·가격 바·펀더멘털·비교기업·문서·일정·분류된 뉴스를 포함할 수 있습니다.",
        },
        {
          en: "Every requested capability is not always available. The run records whether a source family is available, stale, unavailable, or withheld by rights where applicable, and carries provider limitations forward instead of silently filling gaps.",
          ko: "요청된 모든 데이터가 항상 제공되는 것은 아닙니다. 실행 과정은 해당되는 경우 데이터 범위가 사용 가능·지연·사용 불가·권리 제한 상태인지 기록하고, 누락을 임의로 채우는 대신 제공자 제한사항을 보고서까지 전달합니다.",
        },
      ],
    },
    {
      id: "specialists",
      title: {
        en: "3. Specialist and department analysis",
        ko: "3. 전문 역할 및 팀 분석",
      },
      paragraphs: [
        {
          en: "Full-committee research requires eleven accepted specialist memos: three market roles, three company roles, three financial roles, and two risk roles. Each role receives only the evidence needs and decision frame assigned to it, and its claims must reference accepted evidence artifact identifiers.",
          ko: "전체 위원회 리서치는 시장 3개, 기업 3개, 재무 3개, 리스크 2개 등 총 11개 전문 역할의 승인된 메모를 요구합니다. 각 역할은 자신에게 지정된 근거 범위와 판단 프레임을 받고, 주장은 승인된 근거 아티팩트 식별자를 참조해야 합니다.",
        },
        {
          en: "Each department consolidates its member memos into a department position, including supporting or opposing stances, materiality, contrary observations, unresolved questions, evidence references, and an observable condition that could invalidate a claim. Focused-team research stops at the selected department and is explicitly marked as lacking cross-team review.",
          ko: "각 팀은 구성원의 메모를 통합해 찬성·반대 입장, 중요도, 반대 관찰, 미확인 질문, 근거 참조, 주장을 무효화할 수 있는 관찰 조건을 포함한 팀 결론을 만듭니다. 단일 팀 리서치는 선택한 팀 범위에서 종료되며 교차 팀 검토가 없다는 제한을 명시합니다.",
        },
      ],
    },
    {
      id: "challenge",
      title: {
        en: "4. Challenge, response, and ballot",
        ko: "4. 반론, 응답, 투표",
      },
      paragraphs: [
        {
          en: "For full-committee research, the four department consolidations enter a blind challenge round. Department leads challenge assigned claims without relying on the public identity of the original author. The owning department then responds, may revise a claim with authenticated lineage, and records a ballot and remaining disagreement.",
          ko: "전체 위원회 리서치에서는 4개 팀 통합본이 블라인드 반론 단계로 이동합니다. 각 팀장은 원 주장자의 공개 정체성에 의존하지 않고 배정된 주장에 반론을 제기합니다. 이후 담당 팀은 응답하고, 인증된 계보를 남긴 채 주장을 수정할 수 있으며, 투표와 남은 이견을 기록합니다.",
        },
      ],
    },
    {
      id: "audit",
      title: {
        en: "5. Structural and semantic audits",
        ko: "5. 구조 및 의미 감사",
      },
      paragraphs: [
        {
          en: "The structural audit verifies that the required workflow artifacts exist for the same run and sealed snapshot, that evidence content and locators match their stored hashes, and that claims retain valid evidence and lineage. A full-committee run must present the complete set of eleven memos, four consolidations, four challenges, and four response ballots before this stage can pass.",
          ko: "구조 감사는 동일한 실행과 봉인된 스냅샷에 필수 작업 아티팩트가 존재하는지, 근거 내용과 위치정보가 저장된 해시와 일치하는지, 주장에 유효한 근거와 계보가 유지되는지 확인합니다. 전체 위원회 실행은 이 단계를 통과하기 전에 11개 메모, 4개 통합본, 4개 반론, 4개 응답 투표의 완전한 집합을 갖춰야 합니다.",
        },
        {
          en: "The semantic audit compares bilingual claims with fixed evidence excerpts and classifies them as entailed, partial, contradicted, or not assessable. Material contradictions can remove or downgrade the affected claim; an audit artifact does not make an uncertain claim true.",
          ko: "의미 감사는 한·영 주장을 고정된 근거 발췌문과 비교해 뒷받침됨·부분 뒷받침·모순·판단 불가로 분류합니다. 중대한 모순은 해당 주장을 제거하거나 낮은 수준으로 조정할 수 있으며, 감사 아티팩트가 불확실한 주장을 사실로 바꾸지는 않습니다.",
        },
      ],
    },
    {
      id: "synthesis",
      title: {
        en: "6. Chair synthesis and editorial gate",
        ko: "6. 의장 종합 및 편집 품질 게이트",
      },
      paragraphs: [
        {
          en: "The AI chair receives accepted specialist artifacts, the audited claim register, department ballots, capability limits, and the original question. It must produce a decision with a decisive reason, strongest countercase, observable falsifier, confidence, primary claims, and all four department views.",
          ko: "AI 의장은 승인된 전문 역할 아티팩트, 감사된 주장 목록, 팀 투표, 데이터 가용성 제한, 원 질문을 입력으로 받습니다. 의장 결과에는 핵심 판단 근거, 가장 강한 반대 논리, 관찰 가능한 판단 변경 조건, 신뢰도, 주요 주장, 4개 팀의 견해가 포함되어야 합니다.",
        },
        {
          en: "Before persistence, a deterministic editorial gate evaluates both languages. Hard failures include unsupported numbers, invalid claim ownership, anticipated-question evidence conflicts, excess primary-claim reuse, untyped comparators, and unsafe instructions such as an immediate buy or sell or a guaranteed return. One bounded targeted rewrite may repair permitted fields; unresolved hard failures block publication.",
          ko: "저장 전에 결정론적 편집 품질 게이트가 두 언어를 모두 검사합니다. 근거 없는 숫자, 잘못된 주장 소유권, 예상 질문의 근거 충돌, 주요 주장 과다 재사용, 유형이 없는 비교기업, 즉시 매수·매도나 수익 보장과 같은 위험 표현은 발행을 막는 중대 실패입니다. 허용된 필드에는 제한된 1회의 표적 수정이 적용될 수 있으며, 중대 실패가 남으면 발행되지 않습니다.",
        },
      ],
    },
    {
      id: "publication",
      title: { en: "7. Publication and access", ko: "7. 발행 및 공개" },
      paragraphs: [
        {
          en: "A successfully persisted report is stored with its report, run, snapshot, version, source, claim, limitation, and artifact identifiers. Its run ends as completed or complete with limitations. Failed or incomplete stages do not appear as published reports.",
          ko: "저장에 성공한 보고서는 보고서·실행·스냅샷·버전·출처·주장·제한사항·아티팩트 식별자와 함께 보관됩니다. 실행 상태는 완료 또는 제한사항 포함 완료로 종료됩니다. 실패했거나 미완료인 단계는 발행 보고서로 표시되지 않습니다.",
        },
        {
          en: "The public catalog reads the absolute latest stored version. Eligible reports become indexable after seven full days; before that boundary, non-paying readers see a locked card rather than a crawlable report link.",
          ko: "공개 카탈로그는 저장된 절대 최신 버전을 읽습니다. 발행 요건을 충족한 보고서는 만 7일 후 색인 대상이 되며, 그전에는 비결제 이용자에게 검색 가능한 보고서 링크 대신 잠금 카드가 표시됩니다.",
        },
      ],
    },
  ],
} as const satisfies PublicInformationDocument;
