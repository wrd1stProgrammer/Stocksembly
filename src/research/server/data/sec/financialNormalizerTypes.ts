import type { ValueRegistry } from "../../../domain/valueRegistry";
import type { CoreMetric } from "./companyFactsMetrics";

export type FinancialAvailability = "available" | "missing" | "unavailable";

export type FinancialNormalizationResult = {
  readonly registry: ValueRegistry;
  readonly availability: Readonly<Record<CoreMetric, FinancialAvailability>>;
  readonly rejected: readonly {
    readonly candidateId: string;
    readonly reason: "mapping_mismatch" | "unit_mismatch";
  }[];
};
