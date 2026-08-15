import type { EditorialLocaleContent } from "../types";

export const enEditorialContent = {
  ui: {
    blogEyebrow: "THE RESEARCH NOTEBOOK",
    blogTitle: "US stock analysis, without the shortcuts",
    blogDescription:
      "Practical field notes for reading filings, testing assumptions, and comparing companies with evidence.",
    glossaryEyebrow: "THE INVESTOR GLOSSARY",
    glossaryTitle: "Financial terms, made operational",
    glossaryDescription:
      "Clear definitions that show what each metric means, where it breaks, and how to use it in real research.",
    backToBlog: "Back to the blog",
    backToGlossary: "Back to the glossary",
    readArticle: "Read article",
    readDefinition: "Read definition",
    readNext: "Read next",
    minutes: "min read",
    updated: "Updated",
    ctaTitle: "Put the framework to work",
    ctaDescription:
      "Ask the Stocksembly team to investigate a company, challenge the thesis, and preserve the evidence in one research file.",
    ctaAction: "Start a stock research",
    sidebarBlog: "Blog",
    sidebarGlossary: "Glossary",
  },
  entries: {
    "how-to-read-a-10-k": {
      title: "How to Read a 10-K for Stock Research",
      description:
        "A repeatable way to move from business model to cash flow, risks, and the questions management would rather you miss.",
      category: "FILINGS",
      imageAlt:
        "A dark annual filing with blue evidence tabs on an analyst desk",
      sections: [
        {
          heading: "Start with the business, not the income statement",
          paragraphs: [
            "Begin with Item 1 and describe, in plain language, who pays the company, what they buy, and what must stay true for revenue to repeat. Segment notes often reveal that the economic engine is different from the marketing story. Write down customer concentration, distribution dependence, seasonality, and any business whose margin profile can distort the consolidated result.",
          ],
        },
        {
          heading: "Reconcile the narrative with the cash",
          paragraphs: [
            "Move from operating income to operating cash flow and then to free cash flow. Look for working-capital benefits that cannot repeat, capitalized costs, stock-based compensation, acquisition adjustments, and restructuring charges that recur every year. A useful filing review explains why earnings and cash differ instead of treating either number as automatically correct.",
          ],
          bullets: [
            "Compare receivables, inventory, and deferred revenue with sales growth.",
            "Separate maintenance investment from expansion investment when evidence allows.",
            "Read the share-count note before accepting per-share growth.",
          ],
        },
        {
          heading: "Turn risk factors into testable monitoring points",
          paragraphs: [
            "Do not count pages of boilerplate. Identify what changed, which risk is most capable of damaging the thesis, and which disclosed metric would warn you first. Finish with a short list of unanswered questions for the earnings call, competitor filings, and future versions of the report. The goal is not to finish the document; it is to leave with a better research agenda.",
          ],
        },
      ],
    },
    "earnings-quality-and-cash-conversion": {
      title: "Earnings Quality: How to Test Cash Conversion",
      description:
        "Reported profit is a starting point. Learn how working capital, capital intensity, and recurring adjustments change the picture.",
      category: "FINANCIALS",
      imageAlt:
        "A transparent cash stream passing through a dark operating engine",
      sections: [
        {
          heading: "Define the earnings you are trying to validate",
          paragraphs: [
            "Net income, operating profit, EBITDA, and adjusted earnings answer different questions. Choose the measure that matches the business model, then reconcile it to cash over several years. A single quarter can be dominated by billing dates or inventory timing; a cycle shows whether the claimed economics actually arrive in the bank account.",
          ],
        },
        {
          heading: "Classify the gap between profit and cash",
          paragraphs: [
            "A gap may be healthy, temporary, structural, or cosmetic. Fast growth can consume receivables and inventory before producing cash. Subscription billing can do the opposite. Capitalized development, supplier finance, repeated acquisition costs, and stock compensation require separate judgment because they can make headline conversion look stronger than the economics experienced by owners.",
          ],
          bullets: [
            "Measure conversion across a full operating cycle.",
            "Trace recurring adjustments instead of accepting their labels.",
            "Check whether cash improvement came from slower investment or better operations.",
          ],
        },
        {
          heading: "Use quality as a durability question",
          paragraphs: [
            "High-quality earnings are supported by repeatable demand, sensible recognition, disciplined investment, and cash that does not depend on stretching counterparties. The conclusion should state what normalized conversion might look like and which balance-sheet movement would invalidate that view.",
          ],
        },
      ],
    },
    "how-to-choose-comparable-companies": {
      title: "How to Choose Comparable Companies That Actually Compare",
      description:
        "Peer selection is a business-model problem before it becomes a valuation table. Use economics, maturity, and risk to build a defensible set.",
      category: "VALUATION",
      imageAlt: "Five measured glass business blocks with one mismatched peer",
      sections: [
        {
          heading: "Match the economic engine",
          paragraphs: [
            "Industry labels are too broad. Compare how companies acquire customers, price the product, recognize revenue, fund growth, and retain demand. Two software firms can deserve different peer groups when one sells long contracts through enterprise teams and the other depends on self-service usage. Similar revenue does not guarantee similar economics.",
          ],
        },
        {
          heading: "Control for maturity and capital intensity",
          paragraphs: [
            "Growth rate, margin structure, reinvestment needs, cyclicality, geography, and balance-sheet risk shape the multiple investors can rationally pay. Build a core group with the closest economics and a secondary reference group that illuminates one dimension. Do not average them all simply because a data provider lists them together.",
          ],
          bullets: [
            "Explain why every peer is included.",
            "Show the operating difference that limits comparability.",
            "Use medians and ranges, then test the conclusion against fundamentals.",
          ],
        },
        {
          heading: "Treat the multiple as an output",
          paragraphs: [
            "A peer multiple is evidence about market expectations, not an intrinsic answer. Ask which growth, margin, and risk profile is embedded in the subject company's valuation and whether its operating record supports that position. A clean comparison makes disagreement visible instead of hiding it inside an average.",
          ],
        },
      ],
    },
    "bull-base-bear-scenario-analysis": {
      title: "Bull, Base, and Bear Cases: A Scenario Analysis Guide",
      description:
        "Build scenarios from operating assumptions, not arbitrary price targets, and define the evidence that moves one case into another.",
      category: "SCENARIOS",
      imageAlt: "One blue analytical path dividing into three market scenarios",
      sections: [
        {
          heading: "Anchor every case to a common model",
          paragraphs: [
            "Scenarios are useful only when they change the same drivers. Start with units, price, retention, gross margin, operating investment, and capital needs. The base case should be the most defensible path, not a midpoint chosen for symmetry. Bull and bear cases then express coherent alternatives rather than optimistic and pessimistic adjectives.",
          ],
        },
        {
          heading: "Write the mechanism, not just the number",
          paragraphs: [
            "For each changed assumption, explain the event that causes it and the evidence you would observe. Higher margins may require mix shift or utilization; lower growth may follow customer saturation or a weaker channel. Avoid combining peak growth, peak margin, and low investment unless the business mechanics can support all three at once.",
          ],
          bullets: [
            "Keep the forecast horizon and accounting definitions consistent.",
            "Expose revenue, margin, cash, and dilution assumptions together.",
            "Assign monitoring signals rather than false probabilities when evidence is thin.",
          ],
        },
        {
          heading: "Use scenarios to manage uncertainty",
          paragraphs: [
            "The output is a map of what matters. Record the next event capable of changing the case, the early warning signal, and the assumption most sensitive to new evidence. Updating a scenario should change the model and the written rationale at the same time.",
          ],
        },
      ],
    },
    "counterarguments-in-ai-stock-research": {
      title: "Why AI Stock Research Needs a Strong Counterargument",
      description:
        "More agents do not guarantee better analysis. The research process needs independent challenge, evidence tests, and a visible record of disagreement.",
      category: "PROCESS",
      imageAlt: "Two opposing research desks connected by a blue evidence beam",
      sections: [
        {
          heading: "Agreement can be a failure mode",
          paragraphs: [
            "Language models are good at producing coherent explanations, including explanations that share the same hidden assumption. Asking several agents the same question can multiply confidence without adding independent evidence. A useful team separates responsibilities, sources, and incentives before it combines conclusions.",
          ],
        },
        {
          heading: "Make the opposing case falsifiable",
          paragraphs: [
            "The challenger should state the strongest alternative explanation, cite the evidence supporting it, and name the observation that would prove it wrong. It should also attack source freshness, accounting definitions, missing base rates, and unsupported causal claims. Generic caution adds little; a specific rival model improves the decision.",
          ],
          bullets: [
            "Preserve the original thesis before the challenge begins.",
            "Distinguish missing evidence from evidence against the claim.",
            "Record which claims were removed or weakened after review.",
          ],
        },
        {
          heading: "Publish the disagreement trail",
          paragraphs: [
            "A final answer is more trustworthy when readers can see the core debate, unresolved questions, and chair's rationale. The goal is not permanent conflict. It is a controlled process that makes unsupported certainty harder to survive and makes later revisions easier to audit.",
          ],
        },
      ],
    },
    "free-cash-flow": {
      title: "Free Cash Flow (FCF)",
      description:
        "Cash generated after the investment required to maintain and grow the business. Useful, but only after you inspect what the formula leaves out.",
      category: "CASH FLOW",
      imageAlt: "A blue cash stream flowing through an investment filter",
      sections: [
        {
          heading: "Definition",
          paragraphs: [
            "A common definition is operating cash flow minus capital expenditures. It estimates cash available for debt reduction, acquisitions, repurchases, dividends, or additional investment after funding physical and software assets recorded as capital spending.",
          ],
        },
        {
          heading: "How to interpret it",
          paragraphs: [
            "Compare free cash flow with revenue, operating profit, and enterprise value across several years. Rising FCF can signal operating leverage, but it can also reflect delayed investment or a temporary working-capital release. The correct comparison depends on the business's growth stage and capital needs.",
          ],
        },
        {
          heading: "Common trap",
          paragraphs: [
            "The standard formula does not deduct stock-based compensation and may treat acquisition spending or capitalized development inconsistently. Always reconcile share count, working capital, leases, and recurring acquisitions before calling the cash fully available to owners.",
          ],
        },
      ],
    },
    "ev-to-ebitda": {
      title: "EV/EBITDA",
      description:
        "A valuation multiple comparing enterprise value with earnings before interest, tax, depreciation, and amortization.",
      category: "VALUATION",
      imageAlt: "An enterprise structure balanced above an operating engine",
      sections: [
        {
          heading: "Definition",
          paragraphs: [
            "Enterprise value is equity value plus debt and similar claims, less cash and selected investments. Dividing it by EBITDA creates a capital-structure-aware multiple that can help compare operating businesses with different financing choices.",
          ],
        },
        {
          heading: "When it is useful",
          paragraphs: [
            "EV/EBITDA is most informative when peers have comparable accounting, capital intensity, growth, and lease treatment. Use forward or trailing figures consistently and explain whether adjustments remove genuinely nonrecurring items or recurring economic costs.",
          ],
        },
        {
          heading: "Common trap",
          paragraphs: [
            "EBITDA ignores capital expenditure and working-capital needs. It can make asset-heavy or acquisitive businesses look cheaper than their owner cash economics justify. Pair it with free cash flow and balance-sheet analysis.",
          ],
        },
      ],
    },
    "earnings-guidance": {
      title: "Earnings Guidance",
      description:
        "Management's forward-looking range or qualitative outlook for revenue, profit, margins, or other operating measures.",
      category: "EXPECTATIONS",
      imageAlt: "A dark quarterly runway leading toward a blue outlook beacon",
      sections: [
        {
          heading: "Definition",
          paragraphs: [
            "Guidance translates management's current information into an outlook for a future quarter or year. It may cover revenue, adjusted earnings, margin, capital spending, or a business-specific operating metric, usually as a range rather than a point estimate.",
          ],
        },
        {
          heading: "How to analyze it",
          paragraphs: [
            "Compare the midpoint, range width, assumptions, and exclusions with prior guidance and actual outcomes. Separate a changed business outlook from a changed reporting definition. Management's history of raising, narrowing, missing, or conservatively framing guidance is relevant evidence.",
          ],
        },
        {
          heading: "Common trap",
          paragraphs: [
            "Guidance is not a promise or independent forecast. Teams may optimize it for expectations management, and macro or currency assumptions can move quickly. Focus on the operating mechanism and the signals that would change the range.",
          ],
        },
      ],
    },
    "share-dilution": {
      title: "Share Dilution",
      description:
        "The reduction in each existing owner's percentage interest when a company increases its effective share count.",
      category: "OWNERSHIP",
      imageAlt: "A blue ownership ring dividing into many smaller segments",
      sections: [
        {
          heading: "Definition",
          paragraphs: [
            "Dilution occurs when new shares, options, restricted units, convertibles, or acquisition consideration increase the claims on a company's value. Total company value may grow while value per existing share grows more slowly or declines.",
          ],
        },
        {
          heading: "How to measure it",
          paragraphs: [
            "Track diluted weighted-average shares, period-end shares, equity compensation, option assumptions, and convertibles over time. Compare per-share growth with aggregate growth. Repurchases offset dilution only when they retire more ownership than compensation and issuance create.",
          ],
        },
        {
          heading: "Common trap",
          paragraphs: [
            "Stock-based compensation is often excluded from adjusted profit while its dilution remains economically real. Also inspect the price paid for repurchases: buying expensive shares to offset compensation can consume substantial owner cash without creating value.",
          ],
        },
      ],
    },
    "margin-of-safety": {
      title: "Margin of Safety",
      description:
        "The buffer between a conservative estimate of value and the price paid, designed to absorb uncertainty and error.",
      category: "RISK",
      imageAlt: "A blue valuation bridge above a volatile market surface",
      sections: [
        {
          heading: "Definition",
          paragraphs: [
            "A margin of safety is not a fixed discount for every asset. It is a buffer calibrated to uncertainty in demand, margins, financing, competitive durability, and valuation assumptions. Greater uncertainty generally requires a wider buffer.",
          ],
        },
        {
          heading: "How to apply it",
          paragraphs: [
            "Use conservative operating assumptions, scenario ranges, balance-sheet stress, and explicit evidence thresholds. The buffer can come from price, business quality, asset coverage, or a combination, but the source should be stated rather than implied.",
          ],
        },
        {
          heading: "Common trap",
          paragraphs: [
            "A large decline from a previous price is not a margin of safety. Neither is a low multiple when earnings are cyclical or overstated. The comparison must be against a defensible value range that changes when the evidence changes.",
          ],
        },
      ],
    },
  },
} satisfies EditorialLocaleContent;
