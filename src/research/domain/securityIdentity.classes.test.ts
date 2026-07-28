import { describe, expect, it } from "vitest";
import { validateSecurityIdentityInput } from "./securityIdentity";

const baseInput = {
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

describe("security class audit", () => {
  it("admits common stock", () => {
    expect(validateSecurityIdentityInput(baseInput)).toMatchObject({
      kind: "admitted",
      identity: { securityClass: "common_stock" },
    });
  });

  it.each([
    ["American Depositary Shares", "adr"],
    ["ETF", "etf"],
    ["Investment Fund", "fund"],
    ["Common Units", "unit"],
    ["Warrants", "warrant"],
    ["Preferred Stock", "preferred"],
    ["Senior Notes", "debt"],
    ["Class A Shares", "unknown_security_class"],
  ] as const)("rejects %s as %s", (title, reason) => {
    expect(
      validateSecurityIdentityInput({
        ...baseInput,
        coverPages: [{ ...baseInput.coverPages[0], security12bTitle: title }],
      }),
    ).toEqual({ kind: "unsupported", reason });
  });

  it("rejects any cover row whose CIK differs from the ticker row", () => {
    expect(
      validateSecurityIdentityInput({
        ...baseInput,
        coverPages: [
          {
            ...baseInput.coverPages[0],
            form: "8-K",
            tradingSymbol: "OTHER",
            cik: "320193",
          },
          baseInput.coverPages[0],
        ],
      }),
    ).toEqual({ kind: "ambiguous", reason: "source_disagreement" });
  });
});
