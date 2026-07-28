import { describe, expect, it } from "vitest";
import { assertNever } from "./ids";
import {
  resolveSecurityIdentity as resolveUntrustedSecurityIdentity,
  type SecurityIdentityAdmission,
  validateSecurityIdentityInput,
} from "./securityIdentity";

const validInput = {
  submittedSymbol: "NVDA",
  tickerExchangeRows: [{ symbol: "NVDA", cik: "1045810", exchange: "Nasdaq" }],
  filingForms: [
    { form: "10-K", cik: "1045810" },
    { form: "10-Q", cik: "1045810" },
    { form: "8-K", cik: "1045810" },
  ],
  coverPages: [
    {
      form: "10-K",
      tradingSymbol: "NVDA",
      cik: "1045810",
      securityExchangeName: "Nasdaq",
      security12bTitle: "Common Stock",
    },
  ],
};

const resolveSecurityIdentity = validateSecurityIdentityInput;

function admissionTag(result: SecurityIdentityAdmission): string {
  switch (result.kind) {
    case "admitted":
      return result.identity.securityClass;
    case "ambiguous":
      return result.reason;
    case "unsupported":
      return result.reason;
    case "invalid_input":
      return result.reason;
    default:
      return assertNever(result);
  }
}

describe("resolveSecurityIdentity", () => {
  it("admits an exact Nasdaq domestic common-stock 10-K filer", () => {
    const result = resolveSecurityIdentity(validInput);

    expect(result.kind).toBe("admitted");
    if (result.kind !== "admitted") return;
    expect(result.identity).toMatchObject({
      ticker: "NVDA",
      cik: "0001045810",
      exchange: "NASDAQ",
      securityClass: "common_stock",
      title: "Common Stock",
    });
    expect(result.identity.identitySources).toEqual([
      "sec_ticker_exchange",
      "sec_submissions",
      "sec_10k_cover_page",
    ]);
    expect("runId" in result).toBe(false);
  });

  it("returns a typed ambiguous outcome for conflicting ticker rows", () => {
    const result = resolveSecurityIdentity({
      ...validInput,
      tickerExchangeRows: [
        { symbol: "NVDA", cik: "1045810", exchange: "Nasdaq" },
        { symbol: "NVDA", cik: "320193", exchange: "Nasdaq" },
      ],
    });

    expect(result.kind).toBe("ambiguous");
    expect(admissionTag(result)).toBe("ambiguous_ticker");
  });

  it("fails closed on a source disagreement", () => {
    const result = resolveSecurityIdentity({
      ...validInput,
      coverPages: [
        {
          ...validInput.coverPages[0],
          securityExchangeName: "NYSE",
        },
      ],
    });

    expect(result.kind).toBe("ambiguous");
    expect(admissionTag(result)).toBe("source_disagreement");
    expect("runId" in result).toBe(false);
  });

  it("rejects ADR and foreign-private-issuer form history", () => {
    const adr = resolveSecurityIdentity({
      ...validInput,
      filingForms: [
        { form: "20-F", cik: "1045810" },
        { form: "6-K", cik: "1045810" },
      ],
      coverPages: [
        {
          ...validInput.coverPages[0],
          security12bTitle: "American Depositary Shares",
        },
      ],
    });

    expect(adr.kind).toBe("unsupported");
    expect(admissionTag(adr)).toBe("foreign_private_issuer");
  });

  it.each([
    ["ETF", "etf"],
    ["Warrants, each whole warrant exercisable", "warrant"],
  ] as const)("rejects unsupported security class %s", (title, reason) => {
    const result = resolveSecurityIdentity({
      ...validInput,
      coverPages: [{ ...validInput.coverPages[0], security12bTitle: title }],
    });

    expect(result.kind).toBe("unsupported");
    expect(admissionTag(result)).toBe(reason);
  });

  it("rejects an OTC row before a run can be created", () => {
    const result = resolveSecurityIdentity({
      ...validInput,
      tickerExchangeRows: [{ symbol: "NVDA", cik: "1045810", exchange: "OTC" }],
      coverPages: [
        { ...validInput.coverPages[0], securityExchangeName: "OTC" },
      ],
    });

    expect(result.kind).toBe("unsupported");
    expect(admissionTag(result)).toBe("otc");
    expect("runId" in result).toBe(false);
  });

  it("accepts a uniquely matching class while rejecting ambiguous classes", () => {
    const accepted = resolveSecurityIdentity({
      ...validInput,
      coverPages: [
        {
          ...validInput.coverPages[0],
          security12bTitle: "Class A Common Stock",
        },
      ],
    });
    expect(accepted.kind).toBe("admitted");

    const ambiguous = resolveSecurityIdentity({
      ...validInput,
      coverPages: [
        {
          ...validInput.coverPages[0],
          security12bTitle: "Class A Common Stock",
        },
        {
          ...validInput.coverPages[0],
          security12bTitle: "Class B Common Stock",
        },
      ],
    });
    expect(ambiguous.kind).toBe("ambiguous");
    expect(admissionTag(ambiguous)).toBe("ambiguous_security_class");
  });

  it("returns a typed invalid-input outcome for malformed boundary data", () => {
    const result = resolveSecurityIdentity({ submittedSymbol: "NVDA" });

    expect(result.kind).toBe("invalid_input");
    expect(admissionTag(result)).toBe("malformed_input");
  });

  it("does not admit a plain client payload with only one domestic form", () => {
    const result = resolveSecurityIdentity({
      ...validInput,
      filingForms: [{ form: "10-K", cik: "1045810" }],
    });

    expect(result).toEqual({
      kind: "unsupported",
      reason: "insufficient_filing",
    });
    expect("identity" in result).toBe(false);
  });

  it("binds the cover-page triplet to the ticker row CIK", () => {
    const result = resolveSecurityIdentity({
      ...validInput,
      coverPages: [{ ...validInput.coverPages[0], cik: "320193" }],
    });

    expect(result).toEqual({
      kind: "ambiguous",
      reason: "source_disagreement",
    });
    expect("identity" in result).toBe(false);
  });

  it("never treats a complete plain source-shaped bundle as trusted", () => {
    const result = resolveUntrustedSecurityIdentity(validInput);

    expect(result).toEqual({
      kind: "unsupported",
      reason: "untrusted_input",
    });
    expect("identity" in result).toBe(false);
  });

  it("rejects a duplicate cover triplet with a conflicting CIK before dedupe", () => {
    const result = validateSecurityIdentityInput({
      ...validInput,
      coverPages: [
        validInput.coverPages[0],
        { ...validInput.coverPages[0], cik: "320193" },
      ],
    });

    expect(result).toEqual({
      kind: "ambiguous",
      reason: "source_disagreement",
    });
  });

  it("rejects a submission source record with a conflicting CIK", () => {
    const result = validateSecurityIdentityInput({
      ...validInput,
      filingForms: [
        { form: "10-K", cik: "320193" },
        { form: "10-Q", cik: "1045810" },
        { form: "8-K", cik: "1045810" },
      ],
    });

    expect(result).toEqual({
      kind: "ambiguous",
      reason: "source_disagreement",
    });
  });
});
