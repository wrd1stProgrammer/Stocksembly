import { describe, expect, it } from "vitest";
import { auditStructuralClaims } from "./structuralAudit";
import { makeStructuralAuditInput } from "./structuralAudit.testSupport";

describe("deterministic structural audit", () => {
  it("keeps one canonical claim when the same claim id appears more than once", () => {
    // Given
    const fixture = makeStructuralAuditInput("none");
    const firstClaim = fixture.claims[0];
    if (firstClaim === undefined) throw new TypeError("claim fixture missing");
    const input = {
      ...fixture,
      claims: [...fixture.claims, firstClaim],
    };

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.claims).toHaveLength(1);
    expect(result.fixedEvidenceSlices).toHaveLength(1);
    expect(result.metrics.every((metric) => metric.denominator === 1)).toBe(
      true,
    );
  });

  it("derives named denominators and freezes the accepted claim set", () => {
    // Given
    const input = makeStructuralAuditInput("none");

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.publishable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.metrics.map((metric) => metric.id)).toEqual([
      "claim_lineage",
      "exact_span",
      "rights_surface",
      "cutoff_amendment",
      "atomicity",
      "numeric_reproducibility",
      "freshness",
      "opposing_evidence",
      "role_provenance",
      "dissent_retention",
      "open_question_retention",
      "bilingual_parity",
      "capability_exclusion",
      "scenario_safety",
    ]);
    expect(
      result.metrics.every((metric) => metric.passed === metric.denominator),
    ).toBe(true);
    expect(Object.hasOwn(result, "score")).toBe(false);
    expect(result.claimSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.acceptedRoleIds).toHaveLength(11);
    expect(result.retainedDissentClaimIds).toEqual([result.claims[0]?.claimId]);
    expect(result.retainedOpenQuestionIds).toEqual([
      "00000000-0000-4000-8000-000000000006",
    ]);
    expect(result.retainedOpenQuestions).toEqual([
      expect.objectContaining({
        questionId: "00000000-0000-4000-8000-000000000006",
      }),
    ]);
    expect(result.capabilities).toEqual(input.capabilities);
    expect(result.scenarios).toEqual(input.scenarios);
    expect(result.claims[0]?.changeCondition).toEqual(
      input.claims[0]?.claim.changeCondition,
    );
    expect(result.fixedEvidenceSlices).toEqual([
      expect.objectContaining({
        claimId: result.claims[0]?.claimId,
        evidence: [
          expect.objectContaining({
            relation: "supporting",
            source: input.evidence[0]?.source,
            retrievedAt: input.evidence[0]?.retrievedAt,
            availableAt: input.evidence[0]?.availableAt,
          }),
          expect.objectContaining({
            relation: "opposing",
            source: input.evidence[0]?.source,
            retrievedAt: input.evidence[0]?.retrievedAt,
            availableAt: input.evidence[0]?.availableAt,
          }),
        ],
      }),
    ]);
    expect(Object.isFrozen(result.claims)).toBe(true);
    expect(Object.isFrozen(result.claims[0])).toBe(true);
    expect(Object.isFrozen(result.claims[0]?.text)).toBe(true);
    expect(Reflect.set(result.claims[0] ?? {}, "auditStatus", "rejected")).toBe(
      false,
    );
  });

  it.each([
    ["cross_run", "claim_lineage"],
    ["missing_span", "exact_span"],
    ["surface_mismatch", "rights_surface"],
    ["rights_withheld", "rights_surface"],
    ["future_accession", "cutoff_amendment"],
    ["superseded_accession", "cutoff_amendment"],
    ["non_atomic", "atomicity"],
    ["wrong_decimal", "numeric_reproducibility"],
    ["wrong_parent_hash", "numeric_reproducibility"],
    ["stale_material", "freshness"],
    ["missing_opposition", "opposing_evidence"],
    ["opposing_span_mismatch", "exact_span"],
    ["missing_min", "role_provenance"],
    ["dissent_dropped", "dissent_retention"],
    ["question_dropped", "open_question_retention"],
    ["korean_only", "bilingual_parity"],
    ["capability_field", "capability_exclusion"],
    ["target_price", "scenario_safety"],
    ["unknown_scenario_field", "scenario_safety"],
  ] as const)("blocks %s at the precise gate", (fault, gate) => {
    // Given
    const input = makeStructuralAuditInput(fault);

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.publishable).toBe(false);
    expect(result.blockers).toContain(gate);
    const failedMetric = result.metrics.find((metric) => metric.id === gate);
    expect(failedMetric?.passed).toBeLessThan(failedMetric?.denominator ?? 0);
  });

  it("rejects a caller-supplied fabricated denominator", () => {
    // Given
    const input = { ...makeStructuralAuditInput("none"), claimedTotal: 999 };

    // When
    const execute = () => auditStructuralClaims(input);

    // Then
    expect(execute).toThrow();
  });

  it("accepts allowlisted macro evidence without a filing accession", () => {
    // Given
    const fixture = makeStructuralAuditInput("none");
    const input = {
      ...fixture,
      evidence: fixture.evidence.map((item) => ({
        ...item,
        source: "bls_allowlist",
        accession: undefined,
        activeAccession: undefined,
      })),
    };

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.publishable).toBe(true);
  });

  it("accepts authenticated attempt-fenced web evidence after the snapshot cutoff", () => {
    // Given
    const fixture = makeStructuralAuditInput("none");
    const input = {
      ...fixture,
      evidence: fixture.evidence.map((item) => ({
        ...item,
        source: "captured_web",
        availableAt: "2026-02-01T00:00:00.000Z",
        accession: undefined,
        activeAccession: undefined,
        cutoffPolicy: "attempt_fenced_web" as const,
      })),
    };

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.publishable).toBe(true);
    expect(
      result.metrics.find((metric) => metric.id === "cutoff_amendment"),
    ).toEqual(
      expect.objectContaining({
        passed: 1,
        denominator: 1,
      }),
    );
  });

  it("rejects unregistered web evidence after the snapshot cutoff", () => {
    // Given
    const fixture = makeStructuralAuditInput("none");
    const input = {
      ...fixture,
      evidence: fixture.evidence.map((item) => ({
        ...item,
        source: "captured_web",
        availableAt: "2026-02-01T00:00:00.000Z",
        accession: undefined,
        activeAccession: undefined,
      })),
    };

    // When
    const result = auditStructuralClaims(input);

    // Then
    expect(result.publishable).toBe(false);
    expect(result.blockers).toContain("cutoff_amendment");
  });
});
