import type { LegalDocument } from "./legalDocument";

export const privacyDocument: LegalDocument = {
  title: "Privacy Policy",
  description:
    "How SERN collects, uses, stores, and protects personal information when you use Stocksembly.",
  updated: "September 5, 2026",
  notice:
    "Pre-launch draft. Service providers, overseas transfers, exact retention periods, and cookie vendors must be completed before production collection begins.",
  sections: [
    {
      title: "1. Who controls your information",
      paragraphs: [
        "SERN, an individual operator based in South Korea, controls personal information processed through Stocksembly. Privacy questions and requests may be sent to kicoa24@gmail.com.",
      ],
    },
    {
      title: "2. Information we collect",
      bullets: [
        "Account information, such as your email address, display name, authentication identifiers, and account preferences.",
        "Subscription and transaction information, such as plan, amount, payment status, billing country, and receipts. A payment provider may process card or bank details; SERN does not intend to store complete card numbers.",
        "Research content, including tickers, companies, prompts, research questions, generated reports, saved history, and feedback.",
        "Usage and technical information, including IP address, device and browser information, timestamps, viewed pages, feature interactions, crash data, and security logs.",
        "Cookie, analytics, and advertising attribution information used to remember preferences, understand product performance, and measure campaign conversions.",
        "Communications you send to support, privacy, or legal contacts.",
      ],
    },
    {
      title: "3. Why we use information",
      bullets: [
        "Create and secure accounts, authenticate users, and provide requested research.",
        "Store prompts and research history so users can revisit and continue their work.",
        "Process subscriptions, usage charges, cancellations, refunds, and required records.",
        "Operate, troubleshoot, measure, and improve Stocksembly and prevent fraud or misuse.",
        "Respond to requests, communicate service changes, and comply with legal obligations.",
        "Use analytics or advertising measurement cookies where consent or another valid legal basis is required.",
      ],
    },
    {
      title: "4. Legal bases",
      paragraphs: [
        "Depending on your location and the purpose, processing may be necessary to perform a contract with you, comply with law, protect legitimate interests such as security and service improvement, or act on your consent. Where processing relies on consent, you may withdraw it without affecting earlier lawful processing.",
      ],
    },
    {
      title: "5. Prompt storage and AI processing",
      paragraphs: [
        "Stocksembly stores user prompts and research history to deliver persistent research files and related features. Prompts may be sent to infrastructure or AI service providers solely to perform the requested service, subject to appropriate contracts and safeguards.",
        "Private prompts are not used to train general-purpose AI models without separate notice and an appropriate legal basis or consent. Do not submit sensitive personal information, confidential financial credentials, or information you are not authorized to disclose.",
      ],
    },
    {
      title: "6. Cookies, analytics, and advertising measurement",
      paragraphs: [
        "Stocksembly may use essential cookies for login, security, and preferences, analytics cookies to understand aggregate usage and product performance, and Meta Pixel or Conversions API data to measure advertising conversions. Advertising measurement may include pseudonymous identifiers, a hashed account identifier or email address, pages viewed, checkout activity, and purchase value. Where required, these non-essential tools remain off until you consent. You can change browser settings or use the service's cookie controls when available.",
      ],
    },
    {
      title: "7. Service providers and disclosures",
      paragraphs: [
        "SERN may engage providers for hosting, authentication, AI processing, market and news data, payments, analytics, advertising measurement, customer support, and security. These providers include Meta for consent-based advertising attribution. The production provider list and each provider's role will be published before those providers process personal information.",
        "Information may also be disclosed where required by law, to protect users or the service, in connection with a business transfer, or at your direction. SERN does not sell personal information or share it with brokers for affiliate marketing.",
      ],
    },
    {
      title: "8. International transfers",
      paragraphs: [
        "Some providers may process information outside South Korea or your country. Before any such transfer, Stocksembly will identify the recipient, country, purpose, categories, method, timing, retention period, and applicable safeguard or consent mechanism as required by law.",
      ],
    },
    {
      title: "9. Retention and deletion",
      paragraphs: [
        "Account data and stored research are generally retained while the account is active and then deleted or de-identified after a valid deletion request, subject to backup cycles, security needs, unresolved disputes, and mandatory records.",
        "Transaction, tax, consumer-contract, and security records are retained for the periods required by applicable law. Exact production retention periods will be published before launch. When retention ends, information is securely deleted or irreversibly de-identified.",
      ],
    },
    {
      title: "10. Your rights",
      paragraphs: [
        "Depending on applicable law, you may request access, correction, deletion, suspension of processing, withdrawal of consent, or portability, and may object to certain processing. You may also close your account. We may need to verify your identity before completing a request.",
        "To exercise a right, email kicoa24@gmail.com. You may also complain to the competent privacy authority in your jurisdiction.",
      ],
    },
    {
      title: "11. Security and children",
      paragraphs: [
        "Stocksembly uses reasonable administrative, technical, and physical safeguards appropriate to the nature of the information. No system is completely secure, and users should protect their credentials.",
        "Stocksembly is not directed to children who cannot lawfully consent to the service. If we learn that a child's information was collected without required authorization, we will take reasonable steps to delete it.",
      ],
    },
    {
      title: "12. Changes and contact",
      paragraphs: [
        "This policy may change as the product, providers, or law changes. Material updates will be announced in the service or by another reasonable method before they take effect where required.",
        "Privacy contact: SERN, kicoa24@gmail.com, Room 306, 32-4, Banryong-ro 18beon-gil, South Korea.",
      ],
    },
  ],
};
