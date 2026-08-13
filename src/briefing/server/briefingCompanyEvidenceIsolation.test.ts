import { describe, expect, it } from "vitest";
import { companyEvidenceTerms } from "./briefingCompanyEvidence";
import { buildBriefingFinancialContext } from "./briefingFinancialContext";

const genericHeader =
  "UNITED STATES SECURITIES AND EXCHANGE COMMISSION FORM 10-K ".repeat(12);

function selectedEvidence(symbol: string, content: string) {
  const context = buildBriefingFinancialContext({
    symbol,
    documents: [
      {
        id: "annual-report",
        category: "annual",
        title: "Annual report",
        reportedAt: "2025-12-31T00:00:00.000Z",
        publishedAt: "2026-02-15T14:00:00.000Z",
        content: `${genericHeader}${content}`,
      },
    ],
    cutoffAt: "2026-08-11T13:00:00.000Z",
  });
  const excerpt = context?.documents[0]?.excerpt ?? "";
  return { excerpt, terms: companyEvidenceTerms(excerpt, symbol) };
}

describe("briefing company evidence isolation", () => {
  it("keeps the report header beside a deep issuer metric", () => {
    const output = selectedEvidence(
      "NVDA",
      `provision ${"x".repeat(620)} Blackwell data center demand`,
    );

    expect(output.excerpt).toContain("UNITED STATES SECURITIES");
    expect(output.excerpt).toContain("Blackwell data center");
  });

  it.each([
    [
      "AAPL",
      "Services and iPhone led product mix while provision was unchanged",
      "Services",
      "provision",
    ],
    [
      "NVDA",
      `provision ${"x".repeat(620)} Blackwell data center networking`,
      "Blackwell",
      "provision",
    ],
    [
      "TSLA",
      `provision ${"x".repeat(620)} deliveries and automotive gross margin`,
      "deliveries",
      "provision",
    ],
    [
      "MSFT",
      `provision ${"x".repeat(620)} Azure intelligent cloud capex`,
      "Azure",
      "provision",
    ],
    [
      "AMZN",
      `provision ${"x".repeat(620)} AWS advertising fulfillment`,
      "AWS",
      "provision",
    ],
    [
      "JPM",
      `Azure Services ${"x".repeat(620)} CET1 and ROTCE`,
      "CET1",
      "Azure",
    ],
    [
      "XYZ",
      "Services Azure CET1 provision operating margin",
      "operating margin",
      "Services",
    ],
  ])(
    "selects only %s evidence before bounding the excerpt",
    (symbol, content, expected, excluded) => {
      const output = selectedEvidence(symbol, content);

      expect(output.excerpt).toContain(expected);
      expect(output.excerpt.length).toBeLessThanOrEqual(480);
      expect(output.terms).toContain(expected);
      expect(output.terms).not.toContain(excluded);
    },
  );
});
