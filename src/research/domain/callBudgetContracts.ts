import { z } from "zod";
import { AttemptIdSchema, RunIdSchema } from "./ids";
import { WORKFLOW_V1_VERSION } from "./roleRegistry";

export const CALL_BUDGET_POLICY = {
  version: WORKFLOW_V1_VERSION,
  initialCollectionAttempts: 1,
  mandatoryFirstAttempts: 25,
  maxOptionalFollowups: 3,
  maxRequiredReplacements: 5,
  maxPhysicalLaunches: 34,
} as const;

export const LaunchOutcomeSchema = z.enum([
  "accepted",
  "invalid_schema",
  "process_crash",
  "timeout",
  "lost",
  "uncertain",
  "cancelled_race",
  "other_not_accepted",
]);
export type LaunchOutcome = z.infer<typeof LaunchOutcomeSchema>;

const LaunchPurposeSchema = z.enum([
  "mandatory_first",
  "optional_followup",
  "required_replacement",
]);
export type LaunchPurpose = z.infer<typeof LaunchPurposeSchema>;

const LaunchOrdinalSchema = z
  .number()
  .int()
  .positive()
  .brand<"LaunchOrdinal">();
const LogicalArtifactIdSchema = z
  .string()
  .regex(/^[a-z_]+:[a-z0-9_:-]+$/)
  .brand<"LogicalArtifactId">();

export const CreateLedgerSchema = z
  .object({
    runId: RunIdSchema,
    rosterFingerprint: z.string().min(1),
  })
  .strict()
  .readonly();

export const LaunchRequestSchema = z
  .object({
    ordinal: LaunchOrdinalSchema,
    attemptId: AttemptIdSchema,
    logicalArtifactId: LogicalArtifactIdSchema,
    purpose: LaunchPurposeSchema,
    rosterFingerprint: z.string().min(1),
  })
  .strict()
  .readonly();

export const OutcomeRequestSchema = z
  .object({ ordinal: LaunchOrdinalSchema, outcome: LaunchOutcomeSchema })
  .strict()
  .readonly();

export type ResearchLaunch = z.infer<typeof LaunchRequestSchema> & {
  readonly outcome: LaunchOutcome | "reserved";
};

export type CallBudgetFailureReason =
  | "attempt_reused"
  | "budget_drift"
  | "invalid_optional_followup"
  | "mandatory_already_launched"
  | "ordinal_not_monotonic"
  | "ordinal_limit"
  | "ordinal_reused"
  | "optional_followup_limit"
  | "optional_followup_reused"
  | "outcome_already_recorded"
  | "physical_limit"
  | "replacement_already_used"
  | "replacement_capacity_exhausted"
  | "replacement_limit"
  | "replacement_not_needed"
  | "replacement_not_required"
  | "roster_drift"
  | "second_failed_required_launch"
  | "unknown_launch"
  | "unknown_required_artifact";

export type CallBudgetLedger = {
  readonly version: typeof WORKFLOW_V1_VERSION;
  readonly runId: z.infer<typeof RunIdSchema>;
  readonly rosterFingerprint: string;
  readonly status: "open" | "incomplete";
  readonly incompleteReason?: CallBudgetFailureReason;
  readonly launches: readonly ResearchLaunch[];
};

export type CallBudgetTransition =
  | { readonly kind: "reserved"; readonly ledger: CallBudgetLedger }
  | { readonly kind: "recorded"; readonly ledger: CallBudgetLedger }
  | { readonly kind: "incomplete"; readonly ledger: CallBudgetLedger };

export type CallBudgetSummary = {
  readonly mandatoryFirstAttempts: 25;
  readonly followups: number;
  readonly replacements: number;
  readonly physicalLaunches: number;
  readonly burnedOrdinals: number;
};
