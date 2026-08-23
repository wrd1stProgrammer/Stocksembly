import type { PublicInformationDocument } from "./contracts";

export const contactDocument = {
  key: "contact",
  path: "/contact",
  schemaType: "ContactPage",
  title: {
    en: "Contact Stocksembly",
    ko: "Stocksembly 문의",
  },
  description: {
    en: "How to contact Stocksembly about product support, published research, privacy, security, and corrections, and what to include for a useful response.",
    ko: "제품 지원, 공개 리서치, 개인정보, 보안, 정정 요청에 관해 Stocksembly에 문의하는 방법과 정확한 답변을 위해 포함할 내용을 안내합니다.",
  },
  eyebrow: {
    en: "Support and correspondence",
    ko: "지원 및 연락처",
  },
  updated: "2026-08-23",
  sections: [
    {
      id: "channels",
      title: { en: "Contact channels", ko: "문의 채널" },
      paragraphs: [
        {
          en: "Stocksembly is operated by SERN in South Korea. The primary support channel is email at kicoa24@gmail.com. Use this address for product questions, account-access problems, billing questions, privacy requests, security reports, corrections to published research, or questions about the research methodology.",
          ko: "Stocksembly는 대한민국의 SERN이 운영합니다. 기본 지원 채널은 kicoa24@gmail.com 이메일입니다. 제품 사용, 계정 접근 문제, 결제, 개인정보 권리 행사, 보안 제보, 공개 리서치 정정 또는 리서치 방법론에 관한 문의를 이 주소로 보내주세요.",
        },
        {
          en: "A public telephone help desk and real-time trade or order support are not provided. Stocksembly does not connect to brokerage accounts or execute orders. If a question concerns an urgent brokerage transaction, account compromise at another provider, or market order, contact the relevant broker or financial institution directly.",
          ko: "공개 전화 상담 창구와 실시간 매매·주문 지원은 제공하지 않습니다. Stocksembly는 증권 계좌에 연결하거나 주문을 실행하지 않습니다. 긴급한 증권 거래, 다른 사업자의 계정 침해 또는 시장 주문에 관한 문제라면 해당 증권사나 금융기관에 직접 문의해야 합니다.",
        },
      ],
    },
    {
      id: "include",
      title: { en: "What to include", ko: "문의에 포함할 내용" },
      paragraphs: [
        {
          en: "A useful message identifies the page or feature involved, explains what you expected, records what happened instead, and includes the approximate time and browser or device. For a published-research correction, include the report URL, the exact claim or section, why it may be wrong, and a primary or otherwise reliable source when available.",
          ko: "정확한 답변을 받으려면 문제가 발생한 페이지나 기능, 기대했던 결과, 실제로 발생한 상황, 대략적인 시각과 브라우저 또는 기기를 적어주세요. 공개 리서치 정정 요청에는 보고서 URL, 문제가 있다고 보는 정확한 주장이나 섹션, 오류라고 판단한 이유, 가능한 경우 1차 자료 또는 신뢰할 수 있는 출처를 포함해주세요.",
        },
      ],
      bullets: [
        {
          en: "For account or billing help, write from the email associated with the account when possible, but do not send passwords or full payment-card data.",
          ko: "계정 또는 결제 문의는 가능한 경우 가입 이메일에서 보내되, 비밀번호나 전체 결제카드 정보는 보내지 마세요.",
        },
        {
          en: "For a security report, describe the affected URL, reproducible steps, observed impact, and a safe way to contact you; avoid accessing or retaining data that is not yours.",
          ko: "보안 제보에는 영향받은 URL, 재현 단계, 확인된 영향과 안전한 회신 방법을 적고, 본인 소유가 아닌 데이터에 접근하거나 보관하지 마세요.",
        },
      ],
    },
    {
      id: "response",
      title: { en: "Response expectations", ko: "답변 방식" },
      paragraphs: [
        {
          en: "Messages are reviewed as operating capacity allows. A complete first message usually shortens the investigation. Stocksembly may ask for additional, non-sensitive details or confirm identity before acting on an account, billing, or privacy request. Sending a message does not create an investment-advisory, fiduciary, broker-customer, or emergency-support relationship.",
          ko: "문의는 운영 여건에 따라 순차적으로 확인합니다. 첫 문의에 필요한 정보가 충분하면 조사 시간을 줄일 수 있습니다. 계정, 결제 또는 개인정보 요청을 처리하기 전에 민감하지 않은 추가 정보나 본인 확인을 요청할 수 있습니다. 문의를 보냈다는 사실만으로 투자자문, 수탁자, 중개 고객 또는 긴급 지원 관계가 성립하지 않습니다.",
        },
      ],
    },
    {
      id: "privacy",
      title: { en: "Protect sensitive information", ko: "민감정보 보호" },
      paragraphs: [
        {
          en: "Never send an account password, one-time authentication code, brokerage credential, private key, recovery phrase, or complete card number. Share only the minimum information needed to explain the issue. Privacy requests are handled under the published Privacy Policy, and material factual corrections follow the Corrections Policy.",
          ko: "계정 비밀번호, 일회용 인증코드, 증권사 인증정보, 개인키, 복구 문구 또는 전체 카드번호를 보내지 마세요. 문제를 설명하는 데 필요한 최소한의 정보만 공유해주세요. 개인정보 요청은 공개된 개인정보처리방침에 따라, 중요한 사실 정정은 정정 정책에 따라 처리합니다.",
        },
      ],
    },
    {
      id: "postal",
      title: {
        en: "Operator and postal correspondence",
        ko: "운영자 및 우편 연락",
      },
      paragraphs: [
        {
          en: "Operator: SERN. Postal correspondence may be addressed to Room 306, 32-4, Banryong-ro 18beon-gil, South Korea. Email is the recommended channel because it preserves the relevant URL, timestamps, evidence, and reply history needed to investigate a technical or editorial issue.",
          ko: "운영자는 SERN입니다. 우편은 대한민국 반룡로18번길 32-4, 306호로 보낼 수 있습니다. 기술 또는 편집 문제를 조사하는 데 필요한 URL, 시각, 근거와 답변 기록을 보존할 수 있으므로 이메일 문의를 권장합니다.",
        },
      ],
    },
  ],
} as const satisfies PublicInformationDocument;
