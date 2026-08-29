import { z } from "zod";
import { ComparatorQualificationResultSchema } from "../domain/comparatorQualification";
import { qualifyInsightSentryPeers } from "../domain/qualifyInsightSentryPeers";

export const PreSynthesisComparatorQualificationSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("available"),
        qualification: ComparatorQualificationResultSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        status: z.literal("not_available"),
        reason: z.enum(["peer_evidence_absent", "peer_evidence_malformed"]),
        rawPeerArtifactId: z.string().min(1).optional(),
      })
      .strict()
      .readonly(),
  ],
);
export type PreSynthesisComparatorQualification = z.infer<
  typeof PreSynthesisComparatorQualificationSchema
>;

export function sealComparatorContextForChair(
  prepared: PreSynthesisComparatorQualification,
) {
  if (prepared.status === "not_available")
    return {
      mode: "qualitative_only" as const,
      rows: [],
      normalizationAttemptCount: 0,
      omissionReason: prepared.reason,
    };
  const rows = prepared.qualification.rows.filter(
    (row) => row.displayEligibility,
  );
  const normalizationAttemptCount = rows.reduce(
    (count, row) => count + (row.normalizationAttemptCount ?? 0),
    0,
  );
  return prepared.qualification.valuation.status === "eligible"
    ? {
        mode: "numeric_valuation" as const,
        rows,
        valuation: prepared.qualification.valuation,
        normalizationAttemptCount,
      }
    : {
        mode: "qualitative_only" as const,
        rows,
        normalizationAttemptCount,
        omissionReason: prepared.qualification.valuation.reason,
      };
}

export function qualifyComparatorsBeforeSynthesis(
  sources: readonly {
    readonly evidenceId: string;
    readonly artifactId: string;
    readonly bytes: Uint8Array;
  }[],
): PreSynthesisComparatorQualification {
  const source = sources.find(
    (candidate) => candidate.evidenceId === "insightsentry:peers",
  );
  if (source === undefined)
    return { status: "not_available", reason: "peer_evidence_absent" };
  let peers: unknown;
  try {
    peers = JSON.parse(new TextDecoder().decode(source.bytes));
  } catch (error) {
    if (error instanceof SyntaxError)
      return {
        status: "not_available",
        reason: "peer_evidence_malformed",
        rawPeerArtifactId: source.artifactId,
      };
    throw error;
  }
  const qualification = qualifyInsightSentryPeers({
    rawPeerArtifactId: source.artifactId,
    peers,
  });
  return qualification === undefined
    ? {
        status: "not_available",
        reason: "peer_evidence_malformed",
        rawPeerArtifactId: source.artifactId,
      }
    : { status: "available", qualification };
}
