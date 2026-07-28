import type { StructuralAuditInput } from "./structuralAuditContracts";

export function fixedEvidenceSlices(input: StructuralAuditInput) {
  return input.claims
    .filter((candidate) => candidate.claim.materiality === "material")
    .map((candidate) => ({
      claimId: candidate.claim.claimId,
      materiality: candidate.claim.materiality,
      text: candidate.claim.text,
      evidence: [
        ...candidate.claim.supportingEvidence.map((link) => ({
          link,
          relation: "supporting" as const,
        })),
        ...candidate.claim.opposingEvidence.map((link) => ({
          link,
          relation: "opposing" as const,
        })),
      ].flatMap(({ link, relation }) => {
        const item = input.evidence.find(
          (evidence) => evidence.evidenceId === link.evidenceId,
        );
        return item?.span === null || item === undefined
          ? []
          : [
              {
                artifactId: item.artifactId,
                evidenceId: item.evidenceId,
                source: item.source,
                retrievedAt: item.retrievedAt,
                availableAt: item.availableAt,
                locatorHash: item.locatorHash,
                span: item.span,
                exactText: item.content.slice(item.span.start, item.span.end),
                relation,
              },
            ];
      }),
    }));
}
