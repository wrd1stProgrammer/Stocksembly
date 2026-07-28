import type { CapabilityManifest } from "../domain/capabilities";
import type { SpecialistRoleId } from "../domain/roleRegistry";
import type { SnapshotManifest } from "./buildSnapshot";

export const RESEARCH_LOCALES = ["en", "ko"] as const;
export type ResearchLocale = (typeof RESEARCH_LOCALES)[number];
export const RESEARCH_SCOPES = ["broad", "focused"] as const;
export type ResearchScope = (typeof RESEARCH_SCOPES)[number];

export const MATERIAL_CRUXES = [
  "macro_regime",
  "disclosure_chronology",
  "business_segments",
  "product_adoption",
  "competition_positioning",
  "financial_trends",
  "operating_sensitivity",
  "earnings_quality",
  "downside_risk",
  "policy_transmission",
] as const;
export type MaterialCrux = (typeof MATERIAL_CRUXES)[number];

export type MandateLimitation = {
  readonly kind:
    | "current_market_data_unavailable"
    | "consensus_unavailable"
    | "valuation_output_restricted"
    | "snapshot_limitation";
  readonly detail: string;
};

export type ResearchMandateV1 = {
  readonly schemaVersion: "ResearchMandateV1";
  readonly runId: string;
  readonly snapshotId: string;
  readonly manifestHash: string;
  readonly symbol: string;
  readonly question?: string;
  readonly locale: ResearchLocale;
  readonly scope: ResearchScope;
  readonly capabilities: CapabilityManifest;
  readonly materialCruxes: readonly MaterialCrux[];
  readonly limitations: readonly MandateLimitation[];
  readonly briefing: {
    readonly kind: "mandate_briefing";
    readonly author: "system";
    readonly source: "code";
  };
  readonly specialistRoleIds: readonly SpecialistRoleId[];
  readonly chairRoleId: "chair";
  readonly rosterFingerprint: string;
  readonly mandateSealedAt: string;
  readonly mandateHash: string;
};

export const MANDATE_PREREQUISITE_EVENTS = [
  "run_created",
  "collection_started",
  "evidence_cutoff_recorded",
  "snapshot_sealed",
] as const;
export type MandatePrerequisiteEvent =
  (typeof MANDATE_PREREQUISITE_EVENTS)[number];

export type SnapshotAdmission = {
  readonly snapshot: SnapshotManifest;
  readonly lifecycle: readonly MandatePrerequisiteEvent[];
};

export type CreateMandateInput = {
  readonly snapshotManifestHash: string;
  readonly symbol: unknown;
  readonly question?: unknown;
  readonly locale: unknown;
  readonly scope: unknown;
  readonly capabilities: CapabilityManifest;
  readonly rosterIds: readonly string[];
};

export interface ResearchMandateClockPort {
  readonly mandateSealedAt: () => string;
}

export interface ResearchMandateRepositoryPort {
  readonly loadSnapshotAdmission: (
    manifestHash: string,
  ) => Promise<SnapshotAdmission | undefined>;
}

export type CreateMandateDependencies = {
  readonly clock: ResearchMandateClockPort;
  readonly repository: ResearchMandateRepositoryPort;
};
