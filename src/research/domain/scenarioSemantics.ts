import { z } from "zod";

const ScenarioIdSchema = z.enum(["downside", "base", "upside"]);
const ScenarioUnitSchema = z.enum([
  "USD",
  "USD_per_share",
  "percent",
  "multiple",
  "count",
  "shares",
]);
const LineageSchema = z
  .object({
    claimIds: z.array(z.string().trim().min(1)).min(1),
    sourceIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
const PriceImpactSchema = z
  .object({
    percent: z.number().finite(),
    claimIds: z.array(z.string().trim().min(1)).min(1),
    sourceIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const CurrentReferenceSchema = z
  .object({
    metricId: z.string().trim().min(1),
    value: z.number().finite(),
    unit: ScenarioUnitSchema,
    asOf: z.string().datetime(),
    directionality: z.enum(["higher_is_better", "lower_is_better"]),
  })
  .strict();

const ScenarioInputSchema = z
  .object({
    id: ScenarioIdSchema,
    operatingAssumption: z
      .object({
        metricId: z.string().trim().min(1),
        value: z.number().finite(),
        unit: ScenarioUnitSchema,
        referenceValue: z.number().finite(),
        referenceAsOf: z.string().datetime(),
        description: z.string().trim().min(1),
      })
      .strict(),
    investorConsequence: z
      .object({
        direction: z.enum(["negative", "neutral", "positive"]),
        summary: z.string().trim().min(1),
      })
      .strict(),
    lineage: LineageSchema,
    priceImpact: z.unknown().optional(),
  })
  .strict();

type CurrentReference = z.infer<typeof CurrentReferenceSchema>;
type ScenarioInput = z.infer<typeof ScenarioInputSchema>;

export type ScenarioContract = Readonly<Omit<ScenarioInput, "priceImpact">> & {
  readonly priceImpact?: { readonly percent: number };
};

export type ScenarioRepairRequest = {
  readonly kind: "repair_requested";
  readonly scenarioId: string;
  readonly code: "scenario_consequence_contradiction";
};

export type ScenarioOmission = {
  readonly kind: "omit_item";
  readonly scenarioId: string;
  readonly code:
    | "scenario_consequence_contradiction"
    | "scenario_contract_invalid"
    | "scenario_reference_mismatch";
};

export type ScenarioSemanticsResult = {
  readonly scenarios: readonly ScenarioContract[];
  readonly repairs: readonly ScenarioRepairRequest[];
  readonly omissions: readonly ScenarioOmission[];
};

export type ScenarioSemanticsInput = {
  readonly currentReference: unknown;
  readonly scenarios: readonly unknown[];
  readonly repairAttempt: number;
  readonly qualifiedLineage?: unknown;
};

function scenarioId(value: unknown): string {
  const parsed = ScenarioIdSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

function expectedConsequence(
  id: z.infer<typeof ScenarioIdSchema>,
): "negative" | "neutral" | "positive" {
  if (id === "downside") return "negative";
  if (id === "base") return "neutral";
  return "positive";
}

function independentPriceImpact(
  input: ScenarioInput,
  qualifiedLineage: unknown,
): { readonly percent: number } | undefined {
  const priceImpact = PriceImpactSchema.safeParse(input.priceImpact);
  const qualified = LineageSchema.safeParse(qualifiedLineage);
  if (!priceImpact.success || !qualified.success) return undefined;
  const claimIds = new Set(input.lineage.claimIds);
  const sourceIds = new Set(input.lineage.sourceIds);
  const qualifiedClaimIds = new Set(qualified.data.claimIds);
  const qualifiedSourceIds = new Set(qualified.data.sourceIds);
  if (
    priceImpact.data.claimIds.some((claimId) => claimIds.has(claimId)) ||
    priceImpact.data.sourceIds.some((sourceId) => sourceIds.has(sourceId)) ||
    priceImpact.data.claimIds.some(
      (claimId) => !qualifiedClaimIds.has(claimId),
    ) ||
    priceImpact.data.sourceIds.some(
      (sourceId) => !qualifiedSourceIds.has(sourceId),
    )
  )
    return undefined;
  return { percent: priceImpact.data.percent };
}

function candidateOrder(
  reference: CurrentReference,
  candidates: readonly ScenarioInput[],
) {
  const sorted = [...candidates].sort((left, right) => {
    const delta =
      left.operatingAssumption.value - right.operatingAssumption.value;
    return reference.directionality === "higher_is_better" ? delta : -delta;
  });
  const ids = ["downside", "base", "upside"] as const;
  if (sorted.length !== ids.length)
    return sorted.map((input) => ({ input, canonicalId: input.id }));
  return sorted.flatMap((input, index) => {
    const canonicalId = ids[index];
    return canonicalId === undefined ? [] : [{ input, canonicalId }];
  });
}

function sameReference(
  input: ScenarioInput,
  reference: CurrentReference,
): boolean {
  return (
    input.operatingAssumption.metricId === reference.metricId &&
    input.operatingAssumption.unit === reference.unit &&
    input.operatingAssumption.referenceValue === reference.value &&
    input.operatingAssumption.referenceAsOf === reference.asOf
  );
}

export function evaluateScenarioSemantics(
  input: ScenarioSemanticsInput,
): ScenarioSemanticsResult {
  const reference = CurrentReferenceSchema.safeParse(input.currentReference);
  if (!reference.success)
    return {
      scenarios: [],
      repairs: [],
      omissions: input.scenarios.map((item) => ({
        kind: "omit_item",
        scenarioId:
          typeof item === "object" && item !== null && "id" in item
            ? scenarioId(item.id)
            : "unknown",
        code: "scenario_reference_mismatch",
      })),
    };

  const parsed = input.scenarios.map((item) =>
    ScenarioInputSchema.safeParse(item),
  );
  const structuralOmissions = parsed.flatMap((item, index) => {
    if (item.success) return [];
    const original = input.scenarios[index];
    return [
      {
        kind: "omit_item" as const,
        scenarioId:
          typeof original === "object" && original !== null && "id" in original
            ? scenarioId(original.id)
            : "unknown",
        code: "scenario_contract_invalid" as const,
      },
    ];
  });
  const valid = parsed.flatMap((item) => (item.success ? [item.data] : []));
  const referenceMismatches = valid.filter(
    (item) => !sameReference(item, reference.data),
  );
  const aligned = valid.filter((item) => sameReference(item, reference.data));
  const ordering = candidateOrder(reference.data, aligned);
  const repairs: ScenarioRepairRequest[] = [];
  const omissions: ScenarioOmission[] = [
    ...structuralOmissions,
    ...referenceMismatches.map((item) => ({
      kind: "omit_item" as const,
      scenarioId: item.id,
      code: "scenario_reference_mismatch" as const,
    })),
  ];
  const scenarios = ordering.flatMap((candidate) => {
    if (
      candidate.input.investorConsequence.direction !==
      expectedConsequence(candidate.canonicalId)
    ) {
      if (input.repairAttempt <= 0)
        repairs.push({
          kind: "repair_requested",
          scenarioId: candidate.input.id,
          code: "scenario_consequence_contradiction",
        });
      else
        omissions.push({
          kind: "omit_item",
          scenarioId: candidate.input.id,
          code: "scenario_consequence_contradiction",
        });
      return [];
    }
    const priceImpact = independentPriceImpact(
      candidate.input,
      input.qualifiedLineage,
    );
    return [
      {
        id: candidate.canonicalId,
        operatingAssumption: candidate.input.operatingAssumption,
        investorConsequence: candidate.input.investorConsequence,
        lineage: candidate.input.lineage,
        ...(priceImpact === undefined ? {} : { priceImpact }),
      },
    ];
  });
  return { scenarios, repairs, omissions };
}
