import { z } from "zod";
import {
  ReportIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
  TickerSymbolSchema,
} from "../../domain/ids";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../../domain/researchDirection";
import {
  COMMITTEE_RESEARCH_TARGET,
  ResearchTargetSchema,
} from "../../domain/researchTarget";
import { RunStatusSchema } from "../../domain/runStateContracts";

export const NormalizedResearchRequestSchema = z
  .object({
    symbol: TickerSymbolSchema,
    question: z.string().max(RESEARCH_DIRECTION_MAX_CHARACTERS),
    locale: z.enum(["en", "ko"]),
    researchTarget: ResearchTargetSchema.default(COMMITTEE_RESEARCH_TARGET),
  })
  .strict()
  .readonly();
export type NormalizedResearchRequest = z.infer<
  typeof NormalizedResearchRequestSchema
>;

export const PublicRunSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    symbol: TickerSymbolSchema,
    locale: z.enum(["en", "ko"]),
    researchTarget: ResearchTargetSchema.default(COMMITTEE_RESEARCH_TARGET),
    status: RunStatusSchema,
    lastEventSeq: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    reportId: ReportIdSchema.optional(),
  })
  .strict()
  .readonly();
export type PublicRun = z.infer<typeof PublicRunSchema>;

export type ResearchRunIds = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly jobId: string;
  readonly eventId: string;
};

export type CreateResearchRunCommand = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly request: NormalizedResearchRequest;
  readonly ids: ResearchRunIds;
  readonly now: string;
};

export type RunCursor = {
  readonly createdAt: string;
  readonly runId: string;
};

export type CreateResearchRunResult =
  | { readonly kind: "created" | "replayed"; readonly run: PublicRun }
  | {
      readonly kind: "idempotency_conflict" | "queue_full";
    };

export type ResearchIdempotencyLookup =
  | { readonly kind: "missing" | "conflict" }
  | { readonly kind: "replayed"; readonly run: PublicRun };

export type PublicResearchEvent = {
  readonly sequence: number;
  readonly kind: string;
  readonly occurredAt: string;
  readonly stateId: string;
  readonly summary?: { readonly en: string; readonly ko: string };
  readonly actorId?: string;
  readonly artifactId?: string;
  readonly logicalArtifactId?: string;
  readonly reportId?: string;
  readonly reportVersionId?: string;
  readonly participantIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly limitationIds: readonly string[];
};

export type PublicRunDetail = {
  readonly run: PublicRun;
  readonly events: readonly PublicResearchEvent[];
};

export type PublicReport = {
  readonly reportId: string;
  readonly artifactId: string;
  readonly artifactDigest: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly versionId: string;
  readonly version: number;
  readonly status: "complete" | "complete_with_limitations" | "incomplete";
  readonly publishedAt: string;
  readonly payload: import("../persistence/sqlite/safeJson").JsonValue;
};

export type PublicReportLoader = (
  publication: PublicReport,
) => Promise<import("../../domain/report").ResearchReport | undefined>;
