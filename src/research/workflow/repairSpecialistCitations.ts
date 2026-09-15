import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";

/** After a targeted retry, preserve complete evidence bindings or disclose the
 * missing assessment. Never attach a different source to an investment claim. */
export function repairSpecialistCitations(
  candidate: unknown,
  allowedArtifactIds: readonly string[],
): unknown {
  const parsed = SpecialistMemoOutputSchema.safeParse(candidate);
  if (!parsed.success || allowedArtifactIds.length === 0) return candidate;
  const memo = parsed.data;
  const allowed = new Set(allowedArtifactIds);
  if (
    memo.sourceArtifactIds.every((id) => allowed.has(id)) &&
    memo.positions.every((position) =>
      position.evidenceArtifactIds.every((id) => allowed.has(id)),
    )
  )
    return candidate;

  const notice = {
    en: "Some specialist claims were omitted because their cited sources could not be verified after correction. Do not treat the missing assessment as evidence for or against the investment thesis.",
    ko: "교정 후에도 인용 출처를 확인할 수 없는 전문 분석 주장은 제외했습니다. 누락된 평가를 투자 논거의 찬성 또는 반대 근거로 해석하지 마세요.",
  };
  const retained = memo.positions.filter((position) =>
    position.evidenceArtifactIds.every((id) => allowed.has(id)),
  );
  const first = memo.positions[0];
  const scopeArtifactId = allowedArtifactIds[0];
  if (first === undefined || scopeArtifactId === undefined) return candidate;
  const positions =
    retained.length > 0
      ? retained
      : [
          {
            ...first,
            stance: "uncertain" as const,
            publicSummary: {
              en: `${first.roleOwner}: this specialist assessment is unavailable because its source references could not be verified. No directional conclusion is supplied.`,
              ko: `${first.roleOwner}: 인용 출처를 확인하지 못해 이 전문 분석의 평가는 제공하지 않습니다. 방향성 결론은 유보합니다.`,
            },
            // These references identify the supplied input scope, not support for the
            // rejected thesis. Every rejected assertion and numeric binding is removed.
            evidenceArtifactIds: [scopeArtifactId],
            decisiveMetricIds: [],
            strongestContraryObservation: notice,
            falsifier: {
              en: "Reassess this angle only after the underlying claims can be linked to verified sources.",
              ko: "주장을 검증된 출처와 연결할 수 있을 때 이 분석 관점을 다시 평가합니다.",
            },
          },
        ];
  const retainedIds = new Set(retained.map((position) => position.claimId));
  return SpecialistMemoOutputSchema.parse({
    ...memo,
    chartCommentaryJson: null,
    positions,
    sourceArtifactIds: [
      ...new Set([
        ...memo.sourceArtifactIds.filter((id) => allowed.has(id)),
        ...positions.flatMap((position) => position.evidenceArtifactIds),
      ]),
    ],
    dissent: memo.dissent.filter((item) => retainedIds.has(item.claimId)),
    unknowns: [...memo.unknowns.slice(0, 31), notice],
  });
}
