import type { LegalDocument } from "./legalDocument";

export const termsDocument: LegalDocument = {
  title: "Terms of Service",
  description:
    "The terms that govern access to and use of Stocksembly's AI-assisted equity research service.",
  updated: "July 22, 2026",
  notice:
    "Pre-launch draft. These terms reflect the current product design and must be reviewed before commercial launch.",
  sections: [
    {
      title: "1. Agreement to these terms",
      paragraphs: [
        "These Terms of Service form an agreement between you and SERN, an individual operator based in South Korea, for your access to and use of Stocksembly. By creating an account, purchasing a plan, or using the service, you agree to these terms.",
        "If you do not agree, do not access or use Stocksembly. If you use the service on behalf of an organization, you represent that you are authorized to bind that organization.",
      ],
    },
    {
      title: "2. Service description",
      paragraphs: [
        "Stocksembly is an AI-assisted equity research workspace. It coordinates specialist agents, preserves differing views, and produces research materials based on a company, ticker, and research question supplied by the user.",
        "Stocksembly does not execute trades, hold customer assets, provide target prices, or issue buy or sell recommendations. A question tailored by a user changes the scope of the research; it does not create a fiduciary, broker, or investment-adviser relationship.",
      ],
    },
    {
      title: "3. Eligibility and accounts",
      bullets: [
        "You must have legal capacity to enter into these terms and comply with laws applicable to you.",
        "You must provide accurate account information and keep your credentials confidential.",
        "You are responsible for activity performed through your account and must promptly report suspected unauthorized access.",
      ],
    },
    {
      title: "4. Plans, billing, and cancellation",
      paragraphs: [
        "Stocksembly may offer free, subscription, or usage-based access. Price, billing frequency, included usage, renewal terms, and cancellation controls will be shown before purchase. Taxes may apply.",
        "Payments may be processed by a third-party payment provider. SERN does not intend to store complete payment-card numbers. Refunds and cancellation rights will be provided as required by mandatory consumer law and the terms shown at checkout.",
      ],
    },
    {
      title: "5. Acceptable use",
      bullets: [
        "Do not use the service unlawfully, to infringe rights, or to distribute malicious code.",
        "Do not bypass usage limits, access controls, or security measures, or interfere with the service or other users.",
        "Do not scrape, resell, or republish protected data or third-party content except where you have permission.",
        "Do not represent AI-generated research as verified professional advice or guaranteed fact.",
      ],
    },
    {
      title: "6. Your content",
      paragraphs: [
        "You retain rights you hold in prompts, questions, and other content you submit. You grant SERN a limited license to host, process, reproduce, and transmit that content only as reasonably necessary to operate, secure, support, and improve the service.",
        "Stocksembly will not use private prompts to train general-purpose AI models without separate notice and an appropriate legal basis or consent. You must not submit confidential, unlawful, or third-party material that you are not authorized to provide.",
      ],
    },
    {
      title: "7. Stocksembly and third-party materials",
      paragraphs: [
        "The service, its interface, software, and original content are owned by SERN or its licensors. Market data, filings, news, and other source material may be owned and governed by third parties.",
        "Your plan provides a limited, personal, non-transferable right to use Stocksembly. It does not transfer ownership of the service or any third-party data license.",
      ],
    },
    {
      title: "8. AI and data limitations",
      paragraphs: [
        "AI systems may produce inaccurate, incomplete, outdated, or internally inconsistent output. Source availability and timing can vary, and information described as current may be delayed or corrected later.",
        "You must independently verify material facts and use your own judgment before making financial or other decisions. The research disclaimer and risk disclosure form part of these terms.",
      ],
    },
    {
      title: "9. Availability and changes",
      paragraphs: [
        "We may add, remove, suspend, or change features to maintain security, comply with law, or improve the service. We do not guarantee uninterrupted or error-free availability.",
        "We may suspend or terminate access for material breach, unlawful activity, security risk, non-payment, or where continued service is not reasonably possible. Where appropriate, we will provide notice and a reasonable opportunity to export available user content.",
      ],
    },
    {
      title: "10. Disclaimers and liability",
      paragraphs: [
        "To the maximum extent permitted by law, Stocksembly is provided on an as-is and as-available basis without warranties of accuracy, completeness, merchantability, fitness for a particular purpose, or investment outcome.",
        "SERN is not liable for indirect, incidental, special, or consequential loss, lost profits, or investment losses arising from reliance on the service, except where liability cannot legally be excluded or limited. Nothing in these terms limits mandatory consumer rights or liability for fraud, willful misconduct, or other non-excludable matters.",
      ],
    },
    {
      title: "11. Governing law and disputes",
      paragraphs: [
        "These terms are governed by the laws of the Republic of Korea, without depriving consumers of mandatory protections available in their place of residence. The parties should first attempt to resolve a dispute through the contact below. Courts with jurisdiction under applicable law will hear unresolved disputes.",
      ],
    },
    {
      title: "12. Changes and contact",
      paragraphs: [
        "We may update these terms as the product or law changes. Material changes will be announced in the service or by another reasonable method before they take effect, where required.",
        "Questions about these terms may be sent to kicoa24@gmail.com or by post to SERN, Room 306, 32-4, Banryong-ro 18beon-gil, South Korea.",
      ],
    },
  ],
};
