import type { EditorialDepthContent } from "../types";

export const enEditorialDepth = {
  "how-to-read-a-10-k": [
    {
      heading: "A worked example: connect the filing into one research trail",
      paragraphs: [
        "Suppose a subscription company grows revenue from $100 million to $125 million, while accounts receivable rises from $18 million to $30 million. The income statement says growth accelerated, but the cash-flow statement asks a harder question: did customers take longer to pay, or did the company push looser contracts at year-end? Customer counts, remaining performance obligations, overdue receivables, and contract liabilities help distinguish durable demand from timing.",
        "Next, bridge operating cash flow to capital expenditure, stock-based compensation, and diluted shares. Cash can improve while per-share economics deteriorate, and capitalized development can postpone costs that management describes as operating leverage. The objective is not to punish every adjustment; it is to make the economic cost and timing visible.",
        "Use three passes in practice. Map the business and segments first, reconcile income, cash, and the balance sheet second, then challenge management's explanations against risk disclosures and footnotes. A better completion test than pages read is whether you can name the next evidence that would confirm or break the thesis.",
      ],
      bullets: [
        "Check whether Items 1, 7, 8, and 1A tell a consistent story.",
        "Put three years of revenue, operating cash flow, capex, and diluted shares in one table.",
        "Mark accounting-policy, segment, and risk-language changes separately.",
        "For every open question, record the filing or event likely to answer it.",
      ],
    },
  ],
  "earnings-quality-and-cash-conversion": [
    {
      heading: "A simple normalization example",
      paragraphs: [
        "If net income is $20 million, operating cash flow is $15 million, and capital expenditure is $8 million, headline cash conversion is 75% and free cash flow is $7 million. Now suppose operating cash flow includes a $6 million receivables outflow and adds back $5 million of stock compensation. The useful question is which item is a temporary investment in growth and which is a recurring cost of producing the reported earnings.",
        "A $9 million inventory release next year could make conversion appear spectacular. Do not extrapolate that release as permanent margin expansion; show reported cash beside a normalized figure that holds working capital near a sustainable level. The reverse applies to prepaid subscription models, where cash arrives before accounting profit and a high conversion rate does not automatically mean the stock is cheap.",
        "A decision-ready conclusion gives a normalized range and identifies the variables producing it. State which change in payment terms, inventory turns, capitalization policy, maintenance spending, or dilution would force you to revise that range.",
      ],
      bullets: [
        "Compare operating cash flow/net income and free cash flow/operating profit across a cycle.",
        "Classify working-capital moves as growth, seasonality, or counterparty pressure.",
        "Track whether supposedly exceptional adjustments recur for three years.",
        "If cash improved through underinvestment, reserve for the future catch-up cost.",
      ],
    },
  ],
  "how-to-choose-comparable-companies": [
    {
      heading: "Test the peer set with a scorecard",
      paragraphs: [
        "Imagine a software company growing 20%, earning a 15% operating margin, and generating 80% recurring revenue. A mature peer growing 8% at a 35% margin may share an industry code but is a weak anchor for growth expectations. A company with similar growth but significant hardware inventory and factory spending has different cash economics. Growth, margin, recurrence, and capital intensity reveal more than one label.",
        "Give each candidate a simple 0–2 score, but do not turn the average into an automatic valuation. The scorecard exists to reveal why a premium or discount may be justified. Separating three to five core peers from reference peers used for one specific dimension also prevents one extreme observation from controlling the answer.",
        "Finally, write why the subject deserves to trade above or below the median. Higher growth, a longer runway, or lower customer concentration can be tested. Without a testable reason, a premium may be popularity; a discount may hide leverage, dilution, or cyclicality rather than opportunity.",
      ],
      bullets: [
        "Compare customers, billing units, contract duration, and distribution channels.",
        "Align growth and margins to the same period and adjustment policy.",
        "Prefer medians and quartile ranges to a simple mean.",
        "Record one inclusion reason and one limiting difference for every peer.",
      ],
    },
  ],
  "bull-base-bear-scenario-analysis": [
    {
      heading: "Build scenarios whose numbers do not contradict each other",
      paragraphs: [
        "For a company with $100 million of revenue, a base case might combine 12% customer growth with a 3% price increase to produce roughly 15% growth. A bull case should not merely type in 25%; it should explain how a new channel, lower churn, and better mix can coexist. A bear case should trace weaker acquisition or heavier discounting into revenue and gross margin instead of invoking a vague recession.",
        "Changing revenue while freezing operating expense, working capital, and share count creates an internally inconsistent model. Faster growth may require sales hiring or inventory before revenue arrives, and external financing may dilute per-share value. Every case should use the same formulas and accounting definitions so the difference truly comes from the assumptions.",
        "Attach probabilities only when evidence supports them. More often, define which next-quarter observation in net adds, retention, pricing, or gross margin would move the company out of the base range. The model then becomes a way to process evidence rather than decorate a price target.",
      ],
      bullets: [
        "Use the same forecast horizon and valuation method in every case.",
        "Connect revenue, margin, reinvestment, cash, and dilution assumptions.",
        "Give each assumption evidence, a monitoring signal, and an invalidation condition.",
        "After earnings, update the failed assumption before updating the target price.",
      ],
    },
  ],
  "counterarguments-in-ai-stock-research": [
    {
      heading: "Turn the counterargument into a real test",
      paragraphs: [
        "Suppose the thesis claims that product mix will lift gross margin by three percentage points. A challenger should not stop at ‘competition is intense.’ It should separate price, mix, and input cost, then look for data that distinguishes rival explanations: competitor pricing, churn, discounting, or cloud infrastructure expense.",
        "Several agents reading the same documents are not independent confirmation. Give one role primary filings, another competitor and industry evidence, and another accounting definitions and base rates. Preserve each initial judgment before synthesis so agreement produced by shared context is visible rather than mistaken for corroboration.",
        "The final file should retain weakened claims, unresolved questions, and the observation that would reverse the decision. That record lowers the risk of treating fluent model output as fact and makes the next filing a planned test instead of another fresh narrative.",
      ],
      bullets: [
        "Record source, date, and accounting definition for every material claim.",
        "Demand the same specificity and evidence from the counter-thesis.",
        "Keep missing information distinct from evidence against a claim.",
        "Preserve rejected challenges with the chair's reason for auditability.",
      ],
    },
  ],
  "free-cash-flow": [
    {
      heading: "Worked calculation and investor adjustments",
      paragraphs: [
        "Operating cash flow of $50 million minus $18 million of capital expenditure produces $32 million of headline FCF. With a $480 million enterprise value, that is a 6.7% enterprise-value FCF yield. The result is meaningful only if $18 million adequately maintains the assets and operating cash flow is not inflated by a temporary working-capital release.",
        "If the company postponed $7 million of normal equipment replacement, normalized FCF may be closer to $25 million. Conversely, current FCF can understate long-run economics when a clearly separable portion of spending funds optional growth. When disclosure cannot reliably split maintenance from growth, present a range rather than manufacture precision.",
        "Owners should also inspect stock compensation, lease principal, and recurring acquisitions. There is no single statutory FCF definition, so disclose every adjustment and keep the definition consistent when comparing companies.",
      ],
      bullets: [
        "Start with operating cash flow minus capital expenditure.",
        "Use three to five years of working capital to spot temporary cash effects.",
        "Include all capex if maintenance and growth cannot be evidenced separately.",
        "Compare FCF growth with per-share FCF growth to detect dilution.",
      ],
    },
  ],
  "ev-to-ebitda": [
    {
      heading: "Worked multiple and where comparisons break",
      paragraphs: [
        "A company with an $800 million market value, $200 million of debt, and $100 million of cash has a simplified enterprise value of $900 million. With $100 million of EBITDA, EV/EBITDA is 9x. Convertible claims, minority interests, pensions, and leases may require further adjustments, and any numerator adjustment should be consistent with the denominator.",
        "Two companies can both trade at 9x while one spends 10% of EBITDA on maintenance capex and the other spends 45%. The cash left for owners is not comparable. Periods must match as well: using current enterprise value against trailing EBITDA for one peer and forward EBITDA for another creates a false spread.",
        "A useful conclusion says why 9x represents a justified premium or discount to a specified peer set and period. If EBITDA is negative or highly unstable, revenue, free cash flow, or asset value may be the more honest framework.",
      ],
      bullets: [
        "Match debt, cash, and lease adjustments to the EBITDA definition.",
        "Do not mix forward and trailing denominators.",
        "Compare capital expenditure and working-capital demand separately.",
        "Add recurring ‘one-time’ adjustments back into expenses before recalculating.",
      ],
    },
  ],
  "earnings-guidance": [
    {
      heading: "Read the expectation hidden inside the range",
      paragraphs: [
        "Annual revenue guidance of $118–122 million has a $120 million midpoint. If nine-month revenue is $87 million, the company needs about $33 million in the fourth quarter. Comparing that requirement with last year's fourth quarter, seasonality, and backlog is more informative than calling the guidance conservative or aggressive by instinct.",
        "The $4 million width matters too. Determine whether it reflects currency, contract timing, or regulatory approval outside management's control, or weaker demand visibility. Raised guidance can still disappoint when it remains below consensus, and higher revenue with lower margin can produce the opposite earnings reaction.",
        "Track management's accuracy over several quarters. A team that starts low and repeatedly raises should not receive the same confidence as one that frequently changes definitions or misses ranges. Separate forecast behavior from genuine changes in the business.",
      ],
      bullets: [
        "Calculate the midpoint and the performance required for the remaining period.",
        "Compare prior guidance, consensus, and actual results side by side.",
        "Normalize currency, acquisitions, and accounting-definition changes.",
        "Record leading indicators and the historical direction of management's errors.",
      ],
    },
  ],
  "share-dilution": [
    {
      heading: "When company growth and per-share growth diverge",
      paragraphs: [
        "If net income grows 10% from $10 million to $11 million while diluted shares rise from 10 million to 10.5 million, EPS grows from $1.00 to about $1.05—only 4.8%. The company improved, but the economics represented by each existing share grew at less than half the headline rate.",
        "Repurchases do not automatically solve dilution. If a company buys six million shares at a high price while issuing five million through employee awards, net reduction is only one million. Compare opening and closing diluted shares and the actual issuance with the cash spent, not the buyback announcement.",
        "Options and convertibles may not fully appear in basic shares today. Read diluted EPS, stock-compensation, conversion, and acquisition footnotes, then model the expected share count over the same horizon as the operating forecast.",
      ],
      bullets: [
        "Compare revenue and profit growth with their per-share equivalents.",
        "Separate basic, weighted-average diluted, and period-end shares.",
        "Judge repurchases by net share change and average purchase price.",
        "Include unvested awards, options, and convertibles in dilution scenarios.",
      ],
    },
  ],
  "margin-of-safety": [
    {
      heading: "Use a value range instead of one target",
      paragraphs: [
        "Suppose conservative value is $80 per share, base value is $95, and optimistic value is $110. A $70 market price is 26% below the base estimate but only 12.5% below the conservative estimate. When uncertainty is material, the second comparison may matter more than the attractive headline discount.",
        "The required buffer depends on estimation fragility as well as business quality. A recurring-revenue company with net cash needs a different range from one exposed to commodity prices, refinancing, or one customer. Raising the discount rate alone does not neutralize every structural risk.",
        "Do not assume value stayed constant merely because price fell. Earnings damage or dilution can lower the entire value range at the same time. Margin of safety is not a promise that the thesis is right; it is a discipline intended to leave room to survive being wrong.",
      ],
      bullets: [
        "Build conservative, base, and optimistic values instead of one target.",
        "Measure the discount to the conservative value separately.",
        "Review leverage, dilution, and customer concentration outside the model.",
        "When new evidence arrives, update value assumptions before reacting to price.",
      ],
    },
  ],
} satisfies EditorialDepthContent;
