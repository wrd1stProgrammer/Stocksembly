import type { LegalDocument } from "./legalDocument";

export const riskDisclosureDocument: LegalDocument = {
  title: "Risk Disclosure",
  description:
    "Key financial, data, and AI risks to consider before relying on Stocksembly research.",
  updated: "July 22, 2026",
  notice:
    "Pre-launch draft. This summary cannot describe every risk relevant to a security or to your circumstances.",
  sections: [
    {
      title: "Investment loss",
      paragraphs: [
        "Investing involves risk, including loss of principal. Securities can lose value rapidly or become illiquid. You should not invest money you cannot afford to lose.",
      ],
    },
    {
      title: "Market and issuer risk",
      bullets: [
        "Prices may change because of company performance, competition, management decisions, regulation, litigation, technology, or unexpected events.",
        "Interest rates, inflation, currencies, geopolitics, market structure, liquidity, and broad sentiment may affect an investment independently of company fundamentals.",
        "Smaller, concentrated, leveraged, foreign, or thinly traded positions may experience greater volatility and loss.",
      ],
    },
    {
      title: "Data risk",
      paragraphs: [
        "Research quality depends on the availability, timing, licensing, and accuracy of underlying data. Sources can be delayed, revised, inconsistent, incorrectly mapped to a ticker, or unavailable during important events.",
      ],
    },
    {
      title: "Model and AI risk",
      paragraphs: [
        "AI models may fabricate facts, misinterpret documents, overemphasize patterns, fail to reflect changing conditions, or reach a plausible but incorrect synthesis. Agent agreement does not eliminate model risk, and agent disagreement does not identify the correct view.",
      ],
    },
    {
      title: "Scenario risk",
      paragraphs: [
        "Bull, base, and bear cases are conditional illustrations based on assumptions. They are not forecasts, probability guarantees, valuations, or target prices. Small changes in assumptions may materially change a conclusion.",
      ],
    },
    {
      title: "Timing and execution risk",
      paragraphs: [
        "Markets can move before research is produced or updated. Actual transaction prices, fees, taxes, spreads, liquidity, and execution may differ from information visible in the service.",
      ],
    },
    {
      title: "Your responsibility",
      paragraphs: [
        "Stocksembly research should be one input among many. Independently review primary sources, diversify where appropriate, consider your own objectives and risk capacity, and consult a properly licensed professional when needed.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        "Questions about this disclosure may be sent to SERN at kicoa24@gmail.com.",
      ],
    },
  ],
};
