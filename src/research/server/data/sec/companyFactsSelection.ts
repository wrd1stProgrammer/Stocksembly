import { metricDefinition } from "./companyFactsMetrics";
import type {
  CompanyFactCandidate,
  SelectedCompanyFact,
  SelectionReason,
} from "./companyFactsTypes";

function isEligible(
  candidate: CompanyFactCandidate,
): candidate is SelectedCompanyFact {
  return (
    candidate.reason === "selected_latest_filing" &&
    candidate.metric !== undefined &&
    candidate.unit !== undefined &&
    candidate.value !== undefined &&
    candidate.end !== undefined &&
    candidate.periodKind !== undefined &&
    candidate.accessionNumber !== undefined &&
    candidate.form !== undefined &&
    candidate.filedAt !== undefined &&
    candidate.acceptedAt !== undefined
  );
}

function duplicateKey(candidate: SelectedCompanyFact): string {
  return [
    candidate.metric,
    candidate.tag,
    candidate.unit,
    candidate.start ?? "instant",
    candidate.end,
    candidate.periodKind,
    candidate.accessionNumber,
    candidate.form,
  ].join("|");
}

function periodKey(candidate: SelectedCompanyFact): string {
  return [
    candidate.metric,
    candidate.unit,
    candidate.start ?? "instant",
    candidate.end,
    candidate.periodKind,
  ].join("|");
}

function withReason(
  candidate: CompanyFactCandidate,
  reason: SelectionReason,
): CompanyFactCandidate {
  return { ...candidate, reason };
}

export function selectCompanyFacts(
  candidates: readonly CompanyFactCandidate[],
): {
  readonly candidates: readonly CompanyFactCandidate[];
  readonly selected: readonly SelectedCompanyFact[];
} {
  const reasons = new Map<string, SelectionReason>();
  const conflictedPeriods = new Set<string>();
  const duplicateGroups = new Map<string, SelectedCompanyFact[]>();
  for (const candidate of candidates.filter(isEligible)) {
    const key = duplicateKey(candidate);
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), candidate]);
  }
  for (const duplicates of duplicateGroups.values()) {
    if (duplicates.length < 2) continue;
    const values = new Set(duplicates.map((candidate) => candidate.value));
    if (values.size > 1) {
      for (const candidate of duplicates) {
        reasons.set(candidate.candidateId, "conflicting_duplicate");
        conflictedPeriods.add(periodKey(candidate));
      }
      continue;
    }
    for (const duplicate of duplicates.slice(1))
      reasons.set(duplicate.candidateId, "duplicate_same_value");
  }
  for (const candidate of candidates.filter(isEligible))
    if (
      conflictedPeriods.has(periodKey(candidate)) &&
      !reasons.has(candidate.candidateId)
    )
      reasons.set(candidate.candidateId, "superseded_by_later_filing");
  const afterDuplicates = candidates
    .map((candidate) =>
      reasons.has(candidate.candidateId)
        ? withReason(
            candidate,
            reasons.get(candidate.candidateId) ?? candidate.reason,
          )
        : candidate,
    )
    .filter(isEligible);
  const periodGroups = new Map<string, SelectedCompanyFact[]>();
  for (const candidate of afterDuplicates) {
    const key = periodKey(candidate);
    periodGroups.set(key, [...(periodGroups.get(key) ?? []), candidate]);
  }
  for (const group of periodGroups.values()) {
    const ordered = [...group].sort((left, right) => {
      const tagOrder =
        (metricDefinition(left.tag)?.precedence ?? 999) -
        (metricDefinition(right.tag)?.precedence ?? 999);
      return (
        tagOrder || Date.parse(right.acceptedAt) - Date.parse(left.acceptedAt)
      );
    });
    const winner = ordered[0];
    if (winner === undefined) continue;
    for (const candidate of ordered.slice(1)) {
      const isAmended =
        winner.parentAccessionNumber === candidate.accessionNumber;
      const sameTag = winner.tag === candidate.tag;
      reasons.set(
        candidate.candidateId,
        isAmended
          ? "superseded_by_amendment"
          : sameTag
            ? "superseded_by_later_filing"
            : "lower_priority_tag",
      );
    }
  }
  const resolved = candidates.map((candidate) => {
    const reason = reasons.get(candidate.candidateId);
    return reason === undefined ? candidate : withReason(candidate, reason);
  });
  return {
    candidates: resolved,
    selected: resolved.filter(isEligible),
  };
}
