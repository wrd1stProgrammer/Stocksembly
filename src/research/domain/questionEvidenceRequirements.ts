import type { ResearchBrief } from "./researchBrief";

type Requirement = ResearchBrief["cruxes"][number];

/** Required evidence slots, not conclusions or new publication gates. */
export function questionEvidenceRequirements(
  question: string,
): readonly Requirement[] {
  const result: Requirement[] = [];
  if (
    /업종|벤치마크|상대.?강|상대.?성과|outperform|relative strength|benchmark|versus.*sector/iu.test(
      question,
    )
  ) {
    result.push({
      dimension: "relative_performance",
      question:
        "Did the subject outperform a named sector benchmark over the requested horizon?",
      evidenceNeeded:
        "Name the benchmark and give subject return, benchmark return, excess percentage points, identical start/end dates and adjustment basis. Absolute price/volume cannot prove relative performance. Mark the comparison unavailable if either series is missing.",
      searchTerms: [
        "sector benchmark",
        "relative performance",
        "adjusted close",
        "total return",
      ],
    });
  }
  if (/고객|채택|copilot|adoption|customer|paid seats/iu.test(question)) {
    result.push({
      dimension: "adoption",
      question:
        "What disclosed adoption measurements show actual commercial expansion?",
      evidenceNeeded:
        "Retain the latest paid seats, customers, usage or product revenue with prior comparable value and fiscal period. Separate paid adoption from retention/usage. An undisclosed retention rate must not erase disclosed paid-seat evidence.",
      searchTerms: [
        "paid seats",
        "paid customers",
        "active users",
        "retention",
        "product revenue",
      ],
    });
  }
  if (/경쟁|비교|competitor|competitive|compare|versus/iu.test(question)) {
    result.push({
      dimension: "moat",
      question:
        "Which named alternatives are stronger on the dimensions in the question?",
      evidenceNeeded:
        "Name competitors and compare a common product/economic dimension using dated primary evidence. Distinguish qualitative product comparison from valuation peers; missing peer multiples must not suppress product comparison.",
      searchTerms: [
        "competitive alternatives",
        "pricing",
        "market share",
        "customer adoption",
      ],
    });
  }
  if (/현금|설비투자|감가상각|cash|capex|depreciation/iu.test(question)) {
    result.push({
      dimension: "cash_conversion",
      question:
        "How do operations fund investment on one comparable accounting basis?",
      evidenceNeeded:
        "Collect OCF, gross capex, sale/incentive offsets, net capex and issuer-defined FCF for the same fiscal period. Reconcile OCF minus the stated capex definition with FCF. Keep provider-defined and issuer-defined values separate. Separate pre-tax gains from net income and quantify depreciation when disclosed.",
      searchTerms: [
        "operating cash flow",
        "free cash flow reconciliation",
        "purchases of property",
        "depreciation",
        "non-operating income and capital incentives",
        "investment remeasurement gain",
      ],
    });
  }
  if (/규제|허가|로보택시|regulat|permit|robotaxi/iu.test(question)) {
    result.push({
      dimension: "leading_indicator",
      question:
        "Which dated jurisdiction-specific observations indicate deterioration or recovery?",
      evidenceNeeded:
        "Identify authority, jurisdiction, permit state/date and next milestone. Connect margin/cash baselines to adverse thresholds and separate recovery conditions. Do not treat missing permit information or a risk-thesis vote as a current red alert.",
      searchTerms: [
        "regulatory approval",
        "permit",
        "jurisdiction",
        "operating margin",
        "liquidity",
      ],
    });
  }
  return result;
}

export function enrichQuestionEvidence(brief: ResearchBrief): ResearchBrief {
  const required = questionEvidenceRequirements(brief.question);
  if (required.length === 0) return brief;
  const dimensions = new Set(required.map((item) => item.dimension));
  return {
    ...brief,
    priorityDimensions: [
      ...new Set([
        ...required.map((item) => item.dimension),
        ...brief.priorityDimensions,
      ]),
    ].slice(0, 8),
    cruxes: [
      ...required,
      ...brief.cruxes.filter((item) => !dimensions.has(item.dimension)),
      ...brief.cruxes.filter((item) => dimensions.has(item.dimension)),
    ].slice(0, 5),
  };
}
