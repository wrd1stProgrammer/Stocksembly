import { describe, expect, it } from "vitest";
import { evaluateModelTransfer } from "../domain/rights";
import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import { AssignmentAdmissionError, assignAllAgents } from "./assignAllAgents";
import {
  ATOMIC_FAILURE_POINTS,
  makeAssignmentHarness,
  requireAssignments,
} from "./createMandate.testSupport";

const EXPECTED_FOCUS = {
  market: ["official_macro", "market_regime", "price_regime"],
  market_news: [
    "one_hour_short_term_structure",
    "four_hour_medium_term_structure",
    "moving_averages",
    "rsi",
    "macd",
    "atr_volatility",
    "volume_confirmation",
    "support_resistance",
    "invalidation_levels",
    "timeframe_agreement",
  ],
  benchmark: [
    "sector_index_context",
    "peer_relative_performance",
    "cross_asset_regime",
    "rate_beta_sensitivity",
  ],
  company: ["business_model", "segments", "management_discussion_analysis"],
  company_product: ["product", "adoption", "customer_evidence"],
  company_competition: ["competition", "positioning"],
  financial: ["financial_statements", "financial_trends"],
  valuation: [
    "provider_fundamentals",
    "valuation_multiples",
    "fundamental_sensitivity",
    "earnings_power_sensitivity",
  ],
  financial_quality: [
    "cash_conversion",
    "accruals",
    "restatements",
    "auditor_quality",
  ],
  risk: ["downside", "risk_factors"],
  risk_policy: ["policy", "regulatory", "macro_transmission"],
} as const;

describe("immutable all-agent assignments", () => {
  it("persists every exact specialist once, with the chair separate and stable rights-bound slices", async () => {
    // Given
    const first = await makeAssignmentHarness({
      scope: "focused",
      question: "How durable are product adoption and operating margins?",
    });
    const replay = await makeAssignmentHarness({
      scope: "focused",
      question: "How durable are product adoption and operating margins?",
    });

    // When
    const firstResult = requireAssignments(
      await assignAllAgents(first.input, first.repository),
    );
    const replayResult = requireAssignments(
      await assignAllAgents(replay.input, replay.repository),
    );

    // Then
    expect(firstResult.assignments.map((item) => item.roleId)).toEqual(
      WORKFLOW_V1_SPECIALIST_IDS,
    );
    expect(
      new Set(firstResult.assignments.map((item) => item.roleId)).size,
    ).toBe(WORKFLOW_V1_SPECIALIST_IDS.length);
    expect(first.repository.persistedAssignments).toHaveLength(
      WORKFLOW_V1_SPECIALIST_IDS.length,
    );
    expect(first.repository.persistedMandates).toHaveLength(1);
    expect(first.repository.persistedChair?.roleId).toBe(WORKFLOW_V1_CHAIR_ID);
    expect(first.repository.persistedEvents).toEqual(["mandate_sealed"]);
    expect(first.repository.operations).toEqual([
      "run_created",
      "collection_started",
      "evidence_cutoff_recorded",
      "snapshot_sealed",
      "mandate_persisted",
      "assignments_persisted",
      "chair_persisted",
      "mandate_sealed",
    ]);
    expect(
      Object.fromEntries(
        firstResult.assignments.map((item) => [item.roleId, item.focusAreas]),
      ),
    ).toEqual(EXPECTED_FOCUS);
    expect(
      firstResult.assignments.map((item) => item.evidenceSlice.sliceHash),
    ).toEqual(
      replayResult.assignments.map((item) => item.evidenceSlice.sliceHash),
    );
    for (const assignment of firstResult.assignments) {
      expect(assignment.question).toBe(
        "How durable are product adoption and operating margins?",
      );
      expect(assignment.evidenceSlice.snapshotId).toBe(
        first.snapshot.snapshotId,
      );
      expect(assignment.evidenceSlice.manifestHash).toBe(
        first.snapshot.manifestHash,
      );
      for (const artifact of assignment.evidenceSlice.artifacts) {
        expect(evaluateModelTransfer(artifact.rightsSource).kind).toBe(
          "allowed",
        );
        expect(assignment.allowedRightsSources).toContain(
          artifact.rightsSource,
        );
      }
    }
    const sofia = firstResult.assignments.find(
      (item) => item.roleId === "valuation",
    );
    expect(sofia?.focusAreas).toEqual(EXPECTED_FOCUS.valuation);
    expect(sofia?.forbiddenOutputs).toEqual([
      "guaranteed_return",
      "chart_technical_analysis",
      "news_summary",
    ]);
    const june = firstResult.assignments.find(
      (item) => item.roleId === "market_news",
    );
    expect(june?.allowedDatasets).toContain("market_bars");
    expect(june?.allowedDatasets).toContain("insightsentry_news_market");
    expect(june?.allowedDatasets).not.toContain("insightsentry_fundamentals");
    expect(june?.allowedDatasets).not.toContain("insightsentry_news");
    expect(june?.forbiddenOutputs).toEqual(
      expect.arrayContaining(["valuation_analysis", "news_summary"]),
    );
    expect(sofia?.allowedDatasets).toContain("insightsentry_fundamentals");
    expect(sofia?.allowedDatasets).toContain("insightsentry_news_financial");
    expect(sofia?.allowedDatasets).not.toContain("market_bars");
    const market = firstResult.assignments.find(
      (item) => item.roleId === "market",
    );
    const company = firstResult.assignments.find(
      (item) => item.roleId === "company",
    );
    const risk = firstResult.assignments.find((item) => item.roleId === "risk");
    const financial = firstResult.assignments.find(
      (item) => item.roleId === "financial",
    );
    expect(market?.allowedDatasets).toContain("insightsentry_news_market");
    expect(market?.allowedDatasets).toContain("bls_macro");
    expect(market?.allowedDatasets).toContain("sec_institutional_holdings");
    expect(company?.allowedDatasets).toContain("insightsentry_news_company");
    expect(company?.allowedDatasets).toContain("sec_insider_transactions");
    expect(company?.allowedDatasets).toContain("sec_institutional_holdings");
    expect(financial?.allowedDatasets).toContain("sec_insider_transactions");
    expect(financial?.allowedDatasets).toContain("sec_institutional_holdings");
    expect(financial?.allowedDatasets).toContain(
      "insightsentry_news_financial",
    );
    expect(risk?.allowedDatasets).toContain("insightsentry_news_risk");
    expect(risk?.allowedDatasets).toContain("bls_macro");
    expect(risk?.allowedDatasets).toContain("sec_insider_transactions");
    expect(risk?.allowedDatasets).toContain("sec_institutional_holdings");
    expect(june?.allowedDatasets).not.toContain("insightsentry_news_company");
    expect(june?.allowedDatasets).not.toContain("insightsentry_news_risk");
    const firstArtifact = sofia?.evidenceSlice.artifacts[0];
    const firstCapability = sofia?.evidenceSlice.capabilities[0];
    const firstLimitation = sofia?.limitations[0];
    if (
      sofia === undefined ||
      firstArtifact === undefined ||
      firstCapability === undefined ||
      firstLimitation === undefined
    )
      throw new TypeError("assignment fixture requires nested evidence");
    const originalAssignmentHash = sofia.assignmentHash;
    const originalSliceHash = sofia.evidenceSlice.sliceHash;
    expect(Reflect.set(sofia.focusAreas, "0", "tampered")).toBe(false);
    expect(Reflect.set(sofia.evidenceSlice.artifacts, "0", {})).toBe(false);
    expect(Reflect.set(firstArtifact, "evidenceId", "tampered")).toBe(false);
    expect(Reflect.set(firstCapability.state, "availability", "tampered")).toBe(
      false,
    );
    expect(Reflect.set(firstLimitation, "detail", "tampered")).toBe(false);
    expect(sofia.assignmentHash).toBe(originalAssignmentHash);
    expect(sofia.evidenceSlice.sliceHash).toBe(originalSliceHash);
    expect(Object.isFrozen(firstResult.assignments)).toBe(true);
    expect(Object.isFrozen(sofia.evidenceSlice.artifacts)).toBe(true);
  });

  it("rolls back mandate, all assignments, chair, and public event when any atomic sub-write fails", async () => {
    // Given
    const cases = await Promise.all(
      ATOMIC_FAILURE_POINTS.map((failurePoint) =>
        makeAssignmentHarness({ failurePoint }),
      ),
    );

    // When
    const attempts = await Promise.all(
      cases.map((item) =>
        assignAllAgents(item.input, item.repository).catch(
          (error: unknown) => error,
        ),
      ),
    );

    // Then
    for (const attempt of attempts) expect(attempt).toBeInstanceOf(TypeError);
    for (const item of cases) {
      expect(item.repository.persistedMandates).toEqual([]);
      expect(item.repository.persistedAssignments).toEqual([]);
      expect(item.repository.persistedChair).toBeUndefined();
      expect(item.repository.persistedEvents).toEqual([]);
      expect(item.repository.operations).toEqual([
        "run_created",
        "collection_started",
        "evidence_cutoff_recorded",
        "snapshot_sealed",
      ]);
    }
  });

  it("keeps every specialist in broad and focused scopes while changing evidence scope and carrying unavailable limits", async () => {
    // Given
    const broad = await makeAssignmentHarness({ scope: "broad" });
    const focused = await makeAssignmentHarness({
      scope: "focused",
      question: "What policy transmission risks matter?",
    });

    // When
    const broadResult = requireAssignments(
      await assignAllAgents(broad.input, broad.repository),
    );
    const focusedResult = requireAssignments(
      await assignAllAgents(focused.input, focused.repository),
    );

    // Then
    expect(broadResult.assignments).toHaveLength(
      WORKFLOW_V1_SPECIALIST_IDS.length,
    );
    expect(focusedResult.assignments).toHaveLength(
      WORKFLOW_V1_SPECIALIST_IDS.length,
    );
    expect(
      broadResult.assignments.map((item) => item.evidenceSlice.sliceHash),
    ).not.toEqual(
      focusedResult.assignments.map((item) => item.evidenceSlice.sliceHash),
    );
    for (const assignment of [
      ...broadResult.assignments,
      ...focusedResult.assignments,
    ])
      expect(assignment.limitations.map((item) => item.kind)).toEqual(
        expect.arrayContaining([
          "current_market_data_unavailable",
          "consensus_unavailable",
        ]),
      );
  });

  it("fails closed for missing or duplicate roles, unsealed evidence, and cross-snapshot evidence", async () => {
    // Given
    const missing = await makeAssignmentHarness({
      rosterIds: WORKFLOW_V1_SPECIALIST_IDS.slice(1),
    });
    const duplicate = await makeAssignmentHarness({
      rosterIds: [...WORKFLOW_V1_SPECIALIST_IDS, "market"],
    });
    const unsealed = await makeAssignmentHarness({ unsealedEvidence: true });
    const crossed = await makeAssignmentHarness({ crossSnapshot: true });
    const cases = [missing, duplicate, unsealed, crossed];

    // When
    const attempts = await Promise.all(
      cases.map((item) =>
        assignAllAgents(item.input, item.repository).catch(
          (error: unknown) => error,
        ),
      ),
    );

    // Then
    for (const attempt of attempts)
      expect(attempt).toBeInstanceOf(AssignmentAdmissionError);
    expect(
      attempts.map((attempt) =>
        attempt instanceof AssignmentAdmissionError ? attempt.code : "unknown",
      ),
    ).toEqual([
      "specialist_roster_drift",
      "specialist_roster_drift",
      "unsealed_evidence",
      "cross_snapshot",
    ]);
    for (const item of cases) {
      expect(item.repository.persistedAssignments).toEqual([]);
      expect(item.repository.persistedChair).toBeUndefined();
    }
  });
});
