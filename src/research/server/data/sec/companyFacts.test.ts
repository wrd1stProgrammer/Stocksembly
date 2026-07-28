import { describe, expect, it } from "vitest";
import { parseCompanyFacts } from "./companyFacts";
import {
  companyFactsContext as context,
  companyFactsPayload as payload,
} from "./companyFacts.testSupport";

describe("parseCompanyFacts", () => {
  it("retains every candidate and selects the cutoff-valid amendment without guessing units or dimensions", () => {
    // Given a CIK-bound Company Facts response and trusted filing lineage.
    const bytes = payload();

    // When the boundary parses all observations.
    const result = parseCompanyFacts(bytes, context);

    // Then amendment, frame, exclusions, and selection reasons remain auditable.
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.candidates).toHaveLength(5);
      expect(result.selected).toHaveLength(1);
      expect(result.selected[0]).toMatchObject({
        value: "101.2",
        unit: "USD",
        periodKind: "annual",
        parentAccessionNumber: "0001045810-25-000001",
      });
      expect(result.candidates.map((candidate) => candidate.reason)).toEqual(
        expect.arrayContaining([
          "superseded_by_amendment",
          "selected_latest_filing",
          "dimensional_unsupported",
          "unit_mismatch",
          "custom_taxonomy_unsupported",
        ]),
      );
      expect(result.candidates[0]?.frame).toBe("CY2024");
    }
  });

  it("rejects response/request CIK mismatch, post-cutoff retrieval, and conflicting duplicate accession facts", () => {
    // Given malformed identity/time boundaries and a same-accession conflict.
    const mismatched = Buffer.from(
      Buffer.from(payload()).toString().replace('"cik":1045810', '"cik":1'),
    );
    const duplicated = Buffer.from(
      Buffer.from(payload())
        .toString()
        .replace('"val":"101.20"', '"val":"101.20"')
        .replace('"val":"999"', '"val":"102.30"')
        .replace(
          ',"segment":{"dimension":"us-gaap:StatementBusinessSegmentsAxis"}',
          "",
        ),
    );

    // When each unsafe response is parsed.
    const cikResult = parseCompanyFacts(mismatched, context);
    const cutoffResult = parseCompanyFacts(payload(), {
      ...context,
      retrievedAt: "2025-03-02T00:00:00.000Z",
    });
    const postCutoffFactResult = parseCompanyFacts(payload(), {
      ...context,
      cutoffAt: "2025-02-16T00:00:00.000Z",
      retrievedAt: "2025-02-15T00:00:00.000Z",
    });
    const duplicateResult = parseCompanyFacts(duplicated, context);

    // Then none silently selects or fabricates a value.
    expect(cikResult).toEqual({ kind: "rejected", reason: "cik_mismatch" });
    expect(cutoffResult).toEqual({
      kind: "rejected",
      reason: "post_cutoff_source",
    });
    expect(postCutoffFactResult.kind).toBe("parsed");
    if (postCutoffFactResult.kind === "parsed") {
      expect(postCutoffFactResult.selected).toHaveLength(1);
      expect(postCutoffFactResult.selected[0]?.value).toBe("100.1");
      expect(
        postCutoffFactResult.candidates.some(
          (candidate) => candidate.reason === "post_cutoff_fact",
        ),
      ).toBe(true);
    }
    expect(duplicateResult.kind).toBe("parsed");
    if (duplicateResult.kind === "parsed") {
      expect(duplicateResult.selected).toHaveLength(0);
      expect(
        duplicateResult.candidates.filter(
          (candidate) => candidate.reason === "conflicting_duplicate",
        ),
      ).toHaveLength(2);
    }
  });

  it("compares cutoff instants by epoch across equivalent offsets", () => {
    // Given equivalent and one-hour-later retrieval instants in different offsets.
    const equivalentContext = {
      ...context,
      cutoffAt: "2025-02-28T15:00:00.000Z",
      retrievedAt: "2025-03-01T00:00:00.000+09:00",
    };
    const laterContext = {
      ...context,
      cutoffAt: "2025-03-01T00:00:00.000+09:00",
      retrievedAt: "2025-02-28T16:00:00.000Z",
    };

    // When both Company Facts responses cross the timestamp boundary.
    const equivalent = parseCompanyFacts(payload(), equivalentContext);
    const later = parseCompanyFacts(payload(), laterContext);

    // Then equal instants are accepted and the actually later instant is rejected.
    expect(equivalent.kind).toBe("parsed");
    expect(later).toEqual({
      kind: "rejected",
      reason: "post_cutoff_source",
    });
  });

  it("does not select a fact whose end date disagrees with trusted filing period", () => {
    // Given an amendment lineage whose trusted report period differs from its fact.
    const mismatchedPeriodContext = {
      ...context,
      filings: context.filings.map((filing) =>
        filing.form === "10-K/A" ? { ...filing, period: "2024-09-30" } : filing,
      ),
    };

    // When candidates are selected against filing lineage.
    const result = parseCompanyFacts(payload(), mismatchedPeriodContext);

    // Then the mismatched amendment remains retained but cannot supersede the base filing.
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.selected).toHaveLength(1);
      expect(result.selected[0]?.value).toBe("100.1");
      expect(
        result.candidates.some(
          (candidate) =>
            candidate.accessionNumber === "0001045810-25-000002" &&
            candidate.reason === "filing_lineage_mismatch",
        ),
      ).toBe(true);
    }
  });

  it("preserves an ordinary fractional JSON number exactly", () => {
    // Given a native fractional number token used by filed EPS values.
    const fractionalNumber = Buffer.from(
      Buffer.from(payload()).toString().replace('"val":"100.10"', '"val":2.34'),
    );

    // When the lossless Company Facts boundary parses the payload.
    const result = parseCompanyFacts(fractionalNumber, context);

    // Then the exact fractional lexeme is retained without unsupported coercion.
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.candidates[0]?.value).toBe("2.34");
    }
  });

  it("preserves an unsafe-integer JSON number lexeme without rounding", () => {
    // Given an integer number token beyond IEEE-754 safe integer range.
    const unsafeInteger = Buffer.from(
      Buffer.from(payload())
        .toString()
        .replace('"val":"101.20"', '"val":9007199254740993'),
    );

    // When the lossless Company Facts boundary parses the payload.
    const result = parseCompanyFacts(unsafeInteger, context);

    // Then the exact filed integer is selected rather than rounded or rejected.
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.selected).toHaveLength(1);
      expect(result.selected[0]?.value).toBe("9007199254740993");
    }
  });

  it("handles escaped val keys and rejects noncanonical number tokens", () => {
    // Given an escaped semantic key plus malformed numeric and string lexemes.
    const escapedKey = Buffer.from(
      Buffer.from(payload())
        .toString()
        .replace('"val":"100.10"', '"\\u0076al":2.34'),
    );
    const malformedNumber = Buffer.from(
      Buffer.from(payload()).toString().replace('"val":"100.10"', '"val":01'),
    );
    const noncanonicalString = Buffer.from(
      Buffer.from(payload()).toString().replace('"val":"100.10"', '"val":"01"'),
    );

    // When each JSON shape crosses the lossless boundary.
    const escaped = parseCompanyFacts(escapedKey, context);
    const malformed = parseCompanyFacts(malformedNumber, context);
    const noncanonical = parseCompanyFacts(noncanonicalString, context);

    // Then escaped keys remain lossless while both invalid forms reject.
    expect(escaped.kind).toBe("parsed");
    if (escaped.kind === "parsed")
      expect(escaped.candidates[0]?.value).toBe("2.34");
    expect(malformed).toEqual({ kind: "rejected", reason: "malformed_source" });
    expect(noncanonical).toEqual({
      kind: "rejected",
      reason: "malformed_source",
    });
  });

  it("quarantines out-of-range exponents and overlong numeric lexemes", () => {
    // Given canonical JSON numbers beyond the documented financial-safe range.
    const tokens = [
      "1e99999999999999999999",
      "1e-99999999999999999999",
      "1".repeat(129),
    ] as const;

    // When each number crosses the Company Facts decimal boundary.
    const results = tokens.map((token) =>
      parseCompanyFacts(
        Buffer.from(
          Buffer.from(payload())
            .toString()
            .replace('"val":"101.20"', `"val":${token}`),
        ),
        context,
      ),
    );

    // Then every candidate is retained as unsafe and none can supersede the base fact.
    for (const result of results) {
      expect(result.kind).toBe("parsed");
      if (result.kind === "parsed") {
        expect(result.selected[0]?.value).toBe("100.1");
        expect(
          result.candidates.some(
            (candidate) => candidate.reason === "unsafe_numeric_value",
          ),
        ).toBe(true);
      }
    }
  });

  it("retains normal scientific notation as an exact finite decimal", () => {
    // Given a bounded scientific-notation JSON number.
    const scientific = Buffer.from(
      Buffer.from(payload())
        .toString()
        .replace('"val":"101.20"', '"val":2.34e2'),
    );

    // When the Company Facts decimal boundary normalizes it.
    const result = parseCompanyFacts(scientific, context);

    // Then its exact numeric value remains selectable.
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") expect(result.selected[0]?.value).toBe("234");
  });
});
