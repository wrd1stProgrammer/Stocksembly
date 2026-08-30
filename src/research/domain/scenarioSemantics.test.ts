import { describe, expect, it } from "vitest";
import { evaluateScenarioSemantics } from "./scenarioSemantics";

const asOf = "2026-08-10T00:00:00.000Z";

function scenario(input: {
  readonly id: "downside" | "base" | "upside";
  readonly value: number;
  readonly consequence: "negative" | "neutral" | "positive";
  readonly priceImpact?: boolean;
}) {
  return {
    id: input.id,
    operatingAssumption: {
      metricId: "revenue_growth",
      value: input.value,
      unit: "percent",
      referenceValue: 10,
      referenceAsOf: asOf,
      description: `Revenue growth is ${input.value}%`,
    },
    investorConsequence: {
      direction: input.consequence,
      summary: `${input.consequence} investor consequence`,
    },
    lineage: {
      claimIds: [`claim-${input.id}`],
      sourceIds: [`source-${input.id}`],
    },
    ...(input.priceImpact
      ? {
          priceImpact: {
            percent: 12.5,
            claimIds: [`price-claim-${input.id}`],
            sourceIds: [`price-source-${input.id}`],
          },
        }
      : {}),
  };
}

function input(
  scenarios: readonly ReturnType<typeof scenario>[],
  attempt = 0,
  qualifiedLineage?: unknown,
) {
  return {
    currentReference: {
      metricId: "revenue_growth",
      value: 10,
      unit: "percent",
      asOf,
      directionality: "higher_is_better",
    },
    scenarios,
    repairAttempt: attempt,
    ...(qualifiedLineage === undefined ? {} : { qualifiedLineage }),
  };
}

describe("evaluateScenarioSemantics", () => {
  it("relabels valid swapped names into ordered lineaged scenarios without creating a target", () => {
    // Given
    const candidate = input(
      [
        scenario({ id: "downside", value: 20, consequence: "positive" }),
        scenario({
          id: "base",
          value: 10,
          consequence: "neutral",
          priceImpact: true,
        }),
        scenario({ id: "upside", value: 4, consequence: "negative" }),
      ],
      0,
      {
        claimIds: ["price-claim-base"],
        sourceIds: ["price-source-base"],
      },
    );

    // When
    const result = evaluateScenarioSemantics(candidate);

    // Then
    expect(result.scenarios.map((item) => item.id)).toEqual([
      "downside",
      "base",
      "upside",
    ]);
    expect(
      result.scenarios.map((item) => item.operatingAssumption.value),
    ).toEqual([4, 10, 20]);
    expect(result.scenarios[1]?.priceImpact).toEqual({ percent: 12.5 });
    expect(JSON.stringify(result)).not.toContain("target");
  });

  it("requests one scoped repair for a contradictory consequence, then omits only that scenario", () => {
    // Given
    const candidate = input([
      scenario({ id: "downside", value: 4, consequence: "positive" }),
      scenario({ id: "base", value: 10, consequence: "neutral" }),
      scenario({ id: "upside", value: 20, consequence: "positive" }),
    ]);

    // When
    const firstAttempt = evaluateScenarioSemantics(candidate);
    const secondAttempt = evaluateScenarioSemantics({
      ...candidate,
      repairAttempt: 1,
    });

    // Then
    expect(firstAttempt.repairs).toEqual([
      {
        kind: "repair_requested",
        scenarioId: "downside",
        code: "scenario_consequence_contradiction",
      },
    ]);
    expect(secondAttempt.omissions).toEqual([
      {
        kind: "omit_item",
        scenarioId: "downside",
        code: "scenario_consequence_contradiction",
      },
    ]);
    expect(secondAttempt.scenarios.map((item) => item.id)).toEqual([
      "base",
      "upside",
    ]);
  });

  it("omits an unqualified numeric price impact while retaining its lineaged scenario", () => {
    // Given
    const candidate = input([
      {
        ...scenario({ id: "downside", value: 4, consequence: "negative" }),
        priceImpact: {
          percent: -15,
          claimIds: ["claim-downside"],
          sourceIds: ["source-downside"],
        },
      },
      scenario({ id: "base", value: 10, consequence: "neutral" }),
      scenario({ id: "upside", value: 20, consequence: "positive" }),
    ]);

    // When
    const result = evaluateScenarioSemantics(candidate);

    // Then
    expect(result.scenarios[0]?.priceImpact).toBeUndefined();
    expect(result.scenarios[0]?.lineage).toEqual({
      claimIds: ["claim-downside"],
      sourceIds: ["source-downside"],
    });
  });

  it("omits malformed, mixed-unit, and stale-reference items without failing the set", () => {
    // Given
    const candidate = input([
      {
        ...scenario({
          id: "downside",
          value: Number.POSITIVE_INFINITY,
          consequence: "negative",
        }),
        operatingAssumption: {
          metricId: "revenue_growth",
          value: Number.POSITIVE_INFINITY,
          unit: "percent",
          referenceValue: 10,
          referenceAsOf: asOf,
          description: "Revenue growth is invalid",
        },
      },
      {
        ...scenario({ id: "base", value: 10, consequence: "neutral" }),
        operatingAssumption: {
          ...scenario({ id: "base", value: 10, consequence: "neutral" })
            .operatingAssumption,
          unit: "USD_per_share",
        },
      },
      {
        ...scenario({ id: "upside", value: 20, consequence: "positive" }),
        operatingAssumption: {
          ...scenario({ id: "upside", value: 20, consequence: "positive" })
            .operatingAssumption,
          referenceAsOf: "2026-08-09T00:00:00.000Z",
        },
      },
    ]);

    // When
    const result = evaluateScenarioSemantics(candidate);

    // Then
    expect(result.scenarios).toEqual([]);
    expect(result.repairs).toEqual([]);
    expect(result.omissions).toEqual([
      {
        kind: "omit_item",
        scenarioId: "downside",
        code: "scenario_contract_invalid",
      },
      {
        kind: "omit_item",
        scenarioId: "base",
        code: "scenario_reference_mismatch",
      },
      {
        kind: "omit_item",
        scenarioId: "upside",
        code: "scenario_reference_mismatch",
      },
    ]);
  });

  it("keeps ordered valid survivors when one malformed scenario is omitted", () => {
    // Given
    const candidate = input([
      {
        ...scenario({
          id: "downside",
          value: Number.POSITIVE_INFINITY,
          consequence: "negative",
        }),
        operatingAssumption: {
          metricId: "revenue_growth",
          value: Number.POSITIVE_INFINITY,
          unit: "percent",
          referenceValue: 10,
          referenceAsOf: asOf,
          description: "Revenue growth is invalid",
        },
      },
      scenario({ id: "base", value: 10, consequence: "neutral" }),
      scenario({ id: "upside", value: 20, consequence: "positive" }),
    ]);

    // When
    const result = evaluateScenarioSemantics(candidate);

    // Then
    expect(result.scenarios.map((item) => item.id)).toEqual(["base", "upside"]);
    expect(result.repairs).toEqual([]);
    expect(result.omissions).toEqual([
      {
        kind: "omit_item",
        scenarioId: "downside",
        code: "scenario_contract_invalid",
      },
    ]);
  });

  it("strips a price impact whose arbitrary lineage is not independently qualified", () => {
    // Given
    const candidate = input([
      {
        ...scenario({ id: "downside", value: 4, consequence: "negative" }),
        priceImpact: {
          percent: 999,
          claimIds: ["invented-claim"],
          sourceIds: ["invented-source"],
        },
      },
      scenario({ id: "base", value: 10, consequence: "neutral" }),
      scenario({ id: "upside", value: 20, consequence: "positive" }),
    ]);

    // When
    const result = evaluateScenarioSemantics(candidate);

    // Then
    expect(result.scenarios[0]?.priceImpact).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("999");
  });
});
