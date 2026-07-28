import type { LegalDocument } from "./legalDocument";

export const disclaimerDocument: LegalDocument = {
  title: "Research Disclaimer",
  description:
    "Important limitations on Stocksembly's AI-assisted equity research and personalized research questions.",
  updated: "July 22, 2026",
  notice:
    "Pre-launch draft. Stocksembly must not be marketed or operated as personalized investment advice without appropriate regulatory review.",
  sections: [
    {
      title: "Informational research only",
      paragraphs: [
        "Stocksembly provides AI-assisted company and equity research for informational and educational use. It does not provide investment, legal, tax, accounting, or brokerage services.",
      ],
    },
    {
      title: "No recommendation or target price",
      paragraphs: [
        "Stocksembly does not recommend that any person buy, sell, hold, or trade a security and does not provide target prices. Research conclusions, scenarios, debate summaries, and confidence labels are analytical outputs, not instructions to transact.",
      ],
    },
    {
      title: "User-tailored questions",
      paragraphs: [
        "A user may choose a company and ask the agents to investigate a specific issue. This personalization changes the research scope only. Unless Stocksembly is separately authorized and expressly agrees otherwise, it does not assess your income, assets, portfolio, risk tolerance, objectives, or suitability and does not provide a personal investment judgment.",
      ],
    },
    {
      title: "AI limitations",
      paragraphs: [
        "Generative AI and automated analysis can hallucinate, omit context, misread a source, make calculation errors, or preserve outdated information. Multiple agents or an internal debate do not guarantee truth, completeness, independence, or accuracy.",
      ],
    },
    {
      title: "Data and source limitations",
      paragraphs: [
        "Market, company, news, and filing data may be delayed, incomplete, unavailable, revised, or subject to third-party terms. A real-time label should not be understood as a guarantee that every source or output reflects the latest market state. Verify important information against primary and licensed sources.",
      ],
    },
    {
      title: "No fiduciary relationship",
      paragraphs: [
        "Your use of Stocksembly does not create an adviser-client, fiduciary, broker-customer, or other professional relationship. SERN does not know your full circumstances and does not monitor your portfolio or act in your best interest as an investment adviser.",
      ],
    },
    {
      title: "Independent judgment required",
      paragraphs: [
        "You are solely responsible for evaluating research, obtaining qualified professional advice where appropriate, and deciding whether any investment is suitable. Past performance, backtests, scenarios, and model outputs do not predict future results.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        "Questions about this disclaimer may be sent to SERN at kicoa24@gmail.com.",
      ],
    },
  ],
};
