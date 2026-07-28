export function hasFixedSliceArtifacts(
  rows: readonly { readonly artifact_id: string }[],
  claims: readonly {
    readonly evidence: readonly { readonly artifactId: string }[];
  }[],
): boolean {
  return claims
    .flatMap((claim) => claim.evidence)
    .every((slice) => rows.some((row) => row.artifact_id === slice.artifactId));
}
