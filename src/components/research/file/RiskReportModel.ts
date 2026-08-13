import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";

type StructuredClaim = NonNullable<
  NonNullable<ResearchFileData["structuredEditorial"]>["claims"]
>[number];

export type RankedRisk = {
  readonly claimId: string;
  readonly dimension: StructuredClaim["decisionDimension"];
  readonly thesis: string;
  readonly indicator: string;
  readonly impact: "high" | "moderate";
  readonly observability: "measurable" | "observable" | "limited";
  readonly priorityScore: number;
  readonly evidenceArtifactIds: readonly string[];
  readonly decisiveMetricIds: readonly string[];
  readonly signal: "red" | "amber" | "green";
};

const RISK_DIMENSIONS = new Set([
  "downside_path",
  "leading_indicator",
  "mitigant",
]);

function observabilityFor(claim: StructuredClaim): RankedRisk["observability"] {
  if (claim.decisiveMetricIds.length > 0) return "measurable";
  if (claim.evidenceArtifactIds.length >= 2) return "observable";
  return "limited";
}

export function rankStructuredRisks(
  file: Pick<ResearchFileData, "structuredEditorial">,
  locale: Locale,
): readonly RankedRisk[] {
  return (file.structuredEditorial?.claims ?? [])
    .filter((claim) => RISK_DIMENSIONS.has(claim.decisionDimension))
    .map((claim) => {
      const impact: RankedRisk["impact"] =
        claim.materiality === "material" ? "high" : "moderate";
      const observability = observabilityFor(claim);
      const priorityScore =
        (impact === "high" ? 4 : 2) +
        (observability === "measurable"
          ? 2
          : observability === "observable"
            ? 1
            : 0) +
        (claim.stanceContribution === "opposes" ? 1 : 0);
      return {
        claimId: claim.claimId,
        dimension: claim.decisionDimension,
        thesis: claim.publicThesis[locale],
        indicator: claim.falsifier[locale],
        impact,
        observability,
        priorityScore,
        evidenceArtifactIds: claim.evidenceArtifactIds,
        decisiveMetricIds: claim.decisiveMetricIds,
        signal:
          claim.stanceContribution === "supports"
            ? ("red" as const)
            : claim.stanceContribution === "opposes"
              ? ("green" as const)
              : ("amber" as const),
      };
    })
    .sort(
      (first, second) =>
        second.priorityScore - first.priorityScore ||
        first.claimId.localeCompare(second.claimId),
    );
}
