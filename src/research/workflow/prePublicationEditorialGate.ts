import {
  containsCapabilityLeakage,
  containsForbiddenPublicVocabulary,
  containsGenericLimitationLanguage,
  containsNumericDump,
  type EditorialLocale,
  type EditorialQualityReason,
  evaluateEditorialQuality,
  extractNumericTokens,
  meaningfullyRepeats,
  normalizeEditorialText,
  sanitizePublicEditorialText,
} from "../domain/editorialQuality";
import { ANTICIPATED_QUESTIONS_POLICY } from "./anticipatedQuestionsPublication";

export type PublicationQualityViolation = Readonly<{
  code:
    | EditorialQualityReason
    | "generic_hedge"
    | "checkpoint_ownership_conflict"
    | "qa_decision_key_conflict"
    | "qa_evidence_conflict"
    | "qa_primary_claim_limit"
    | "qa_question_conflict"
    | "low_information_public_text"
    | "weak_comparator"
    | "unsafe_public_claim";
  path: string;
  relatedPath?: string;
}>;

export type PrePublicationSection = Readonly<{
  sectionKey: string;
  text: Readonly<{ en: string; ko: string }>;
  claimIds: readonly string[];
  checkpoint?: Readonly<{ en: string; ko: string }>;
}>;

export type PrePublicationQuestion = Readonly<{
  questionId: string;
  decisionKey: string;
  question: Readonly<{ en: string; ko: string }>;
  answer: Readonly<{ en: string; ko: string }>;
  primaryClaimIds: readonly string[];
  evidenceArtifactIds: readonly string[];
  rank: number;
}>;

export type PrePublicationEditorialCandidate = Readonly<{
  position: Readonly<{ en: string; ko: string }>;
  rationale: Readonly<{ en: string; ko: string }>;
  sections: readonly PrePublicationSection[];
  comparators: readonly Readonly<{
    comparatorId: string;
    role: "direct_competitor" | "operating_comparable" | "valuation_proxy";
    rationale: Readonly<{ en: string; ko: string }>;
    comparableMetricKeys: readonly string[];
  }>[];
  anticipatedQuestions: readonly PrePublicationQuestion[];
  supportedNumbers: readonly string[];
  permittedClaimIds: readonly string[];
  permittedEvidenceArtifactIds: readonly string[];
  confidence: "high" | "medium" | "low";
}>;

export type PrePublicationEditorialEnvelope = Readonly<{
  gateVersion: "editorial-quality-v1";
  qaPolicy: typeof ANTICIPATED_QUESTIONS_POLICY &
    Readonly<{
      supportedCount: number;
      moduleVisible: boolean;
    }>;
  candidate: PrePublicationEditorialCandidate;
  fieldLineage?: Readonly<Record<string, "synthesis" | "targeted_rewrite">>;
}>;

const GENERIC_HEDGES = [
  /could (?:rise|improve).{0,80}(?:but|while).{0,80}could (?:fall|weaken)/iu,
  /on the one hand.{0,160}on the other hand/iu,
  /상승할 수.{0,80}(?:하지만|반면).{0,80}하락할 수/iu,
] as const;

function issue(
  code: PublicationQualityViolation["code"],
  path: string,
  relatedPath?: string,
): PublicationQualityViolation {
  return relatedPath === undefined
    ? { code, path }
    : { code, path, relatedPath };
}

function publicFields(candidate: PrePublicationEditorialCandidate) {
  return (["en", "ko"] as const).flatMap((locale) => [
    { path: `position.${locale}`, text: candidate.position[locale], locale },
    { path: `rationale.${locale}`, text: candidate.rationale[locale], locale },
    ...candidate.sections.map((section, index) => ({
      path: `sections[${index}].text.${locale}`,
      text: section.text[locale],
      locale,
    })),
    ...candidate.anticipatedQuestions.map((qa, index) => ({
      path: `anticipatedQuestions[${index}].answer.${locale}`,
      text: qa.answer[locale],
      locale,
    })),
    ...candidate.anticipatedQuestions.map((qa, index) => ({
      path: `anticipatedQuestions[${index}].question.${locale}`,
      text: qa.question[locale],
      locale,
    })),
  ]);
}

function isLowInformationPublicText(text: string): boolean {
  const normalized = normalizeEditorialText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length > 2) return false;
  return (
    extractNumericTokens(text).length > 0 ||
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/iu.test(text.trim()) ||
    /^[\p{L}\p{N}_-]+$/u.test(normalized)
  );
}

function containsInternalMetadataLeakage(text: string): boolean {
  return /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/iu.test(text);
}

function containsUnsafePublicClaim(text: string): boolean {
  return (
    /\b(?:buy|sell)\s+now\b|guaranteed return/iu.test(text) ||
    /(?:지금|즉시)\s*(?:매수|매도)|수익\s*보장/u.test(text)
  );
}

function localeViolations(
  candidate: PrePublicationEditorialCandidate,
  locale: EditorialLocale,
): PublicationQualityViolation[] {
  const evaluated = evaluateEditorialQuality({
    locale,
    position: candidate.position[locale],
    rationale: candidate.rationale[locale],
    supportedNumbers: candidate.supportedNumbers,
    sections: candidate.sections.map((section) => ({
      sectionKey: section.sectionKey,
      claimIds: section.claimIds,
      text: section.text[locale],
    })),
    comparators: candidate.comparators.map((comparator) => ({ ...comparator })),
    anticipatedQuestions: candidate.anticipatedQuestions.map((qa) => ({
      decisionKey: qa.decisionKey,
      answer: qa.answer[locale],
      primaryClaimIds: qa.primaryClaimIds,
    })),
  });
  const localize = (path: string) =>
    /^(?:position|rationale|sections\[\d+\]\.text|anticipatedQuestions\[\d+\]\.answer)$/u.test(
      path,
    )
      ? `${path}.${locale}`
      : path;
  return evaluated.issues.map((entry) =>
    issue(
      entry.reason,
      localize(entry.leftPath),
      entry.rightPath === undefined ? undefined : localize(entry.rightPath),
    ),
  );
}

export function evaluatePrePublicationEditorialGate(
  candidate: PrePublicationEditorialCandidate,
): Readonly<{
  passed: boolean;
  publishable: boolean;
  violations: readonly PublicationQualityViolation[];
  hardViolations: readonly PublicationQualityViolation[];
  softViolations: readonly PublicationQualityViolation[];
}> {
  const violations = [
    ...localeViolations(candidate, "en"),
    ...localeViolations(candidate, "ko"),
  ];
  const fields = publicFields(candidate);
  const supported = new Set(
    candidate.supportedNumbers.map((value) => value.replaceAll(",", "")),
  );
  for (const field of fields) {
    if (GENERIC_HEDGES.some((pattern) => pattern.test(field.text)))
      violations.push(issue("generic_hedge", field.path));
    if (extractNumericTokens(field.text).some((value) => !supported.has(value)))
      violations.push(issue("unsupported_number", field.path));
    if (containsNumericDump(field.text))
      violations.push(issue("numeric_density", field.path));
    if (containsForbiddenPublicVocabulary(field.text))
      violations.push(issue("forbidden_public_vocabulary", field.path));
    if (containsCapabilityLeakage(field.text))
      violations.push(issue("capability_leakage", field.path));
    if (containsGenericLimitationLanguage(field.text))
      violations.push(issue("generic_limitation_language", field.path));
    if (containsUnsafePublicClaim(field.text))
      violations.push(issue("unsafe_public_claim", field.path));
    if (isLowInformationPublicText(field.text))
      violations.push(issue("low_information_public_text", field.path));
    if (containsInternalMetadataLeakage(field.text))
      violations.push(issue("forbidden_public_vocabulary", field.path));
  }
  for (const locale of ["en", "ko"] as const) {
    for (let left = 0; left < candidate.sections.length; left += 1) {
      for (
        let right = left + 1;
        right < candidate.sections.length;
        right += 1
      ) {
        const first = candidate.sections[left];
        const second = candidate.sections[right];
        if (
          first !== undefined &&
          second !== undefined &&
          meaningfullyRepeats(first.text[locale], second.text[locale])
        )
          violations.push(
            issue(
              "semantic_repetition",
              `sections[${right}].text.${locale}`,
              `sections[${left}].text.${locale}`,
            ),
          );
      }
    }
  }
  const claimOwner = new Map<string, string>();
  const checkpointOwner = new Map<string, string>();
  candidate.sections.forEach((section, index) => {
    for (const claimId of section.claimIds) {
      const path = `sections[${index}].claimIds`;
      const owner = claimOwner.get(claimId);
      if (owner !== undefined)
        violations.push(issue("section_ownership_conflict", path, owner));
      else claimOwner.set(claimId, path);
      if (!candidate.permittedClaimIds.includes(claimId))
        violations.push(issue("section_ownership_conflict", path));
    }
    for (const locale of ["en", "ko"] as const) {
      const checkpoint = section.checkpoint?.[locale];
      if (checkpoint === undefined) continue;
      const path = `sections[${index}].checkpoint.${locale}`;
      const key = normalizeEditorialText(checkpoint);
      const owner = checkpointOwner.get(`${locale}:${key}`);
      if (owner !== undefined)
        violations.push(issue("checkpoint_ownership_conflict", path, owner));
      else checkpointOwner.set(`${locale}:${key}`, path);
    }
  });
  const decisionOwner = new Map<string, string>();
  const evidenceOwner = new Map<string, string>();
  const questionOwner = new Map<string, string>();
  const primaryCounts = new Map<string, number>();
  candidate.anticipatedQuestions.forEach((qa, index) => {
    const base = `anticipatedQuestions[${index}]`;
    const decisionPath = `${base}.decisionKey`;
    const priorDecision = decisionOwner.get(qa.decisionKey);
    if (priorDecision !== undefined)
      violations.push(
        issue("qa_decision_key_conflict", decisionPath, priorDecision),
      );
    else decisionOwner.set(qa.decisionKey, decisionPath);
    const evidenceKey = `${qa.decisionKey}|${[...qa.evidenceArtifactIds].sort().join(",")}`;
    const priorEvidence = evidenceOwner.get(evidenceKey);
    if (priorEvidence !== undefined)
      violations.push(
        issue(
          "qa_evidence_conflict",
          `${base}.evidenceArtifactIds`,
          priorEvidence,
        ),
      );
    else evidenceOwner.set(evidenceKey, `${base}.evidenceArtifactIds`);
    for (const locale of ["en", "ko"] as const) {
      const questionKey = `${locale}:${normalizeEditorialText(qa.question[locale])}`;
      const priorQuestion = questionOwner.get(questionKey);
      if (priorQuestion !== undefined)
        violations.push(
          issue(
            "qa_question_conflict",
            `${base}.question.${locale}`,
            priorQuestion,
          ),
        );
      else questionOwner.set(questionKey, `${base}.question.${locale}`);
    }
    for (const claimId of qa.primaryClaimIds) {
      primaryCounts.set(claimId, (primaryCounts.get(claimId) ?? 0) + 1);
      if (!candidate.permittedClaimIds.includes(claimId))
        violations.push(
          issue("qa_primary_claim_limit", `${base}.primaryClaimIds`),
        );
    }
    if (
      qa.evidenceArtifactIds.some(
        (id) => !candidate.permittedEvidenceArtifactIds.includes(id),
      )
    )
      violations.push(
        issue("qa_evidence_conflict", `${base}.evidenceArtifactIds`),
      );
  });
  for (const [claimId, count] of primaryCounts)
    if (count > ANTICIPATED_QUESTIONS_POLICY.maximumPerPrimaryClaim) {
      const owners = candidate.anticipatedQuestions
        .map((qa, index) => (qa.primaryClaimIds.includes(claimId) ? index : -1))
        .filter((index) => index >= 0);
      for (const index of owners.slice(
        ANTICIPATED_QUESTIONS_POLICY.maximumPerPrimaryClaim,
      ))
        violations.push(
          issue(
            "qa_primary_claim_limit",
            `anticipatedQuestions[${index}].primaryClaimIds`,
          ),
        );
    }
  candidate.comparators.forEach((comparator, index) => {
    const rationale = comparator.rationale as
      | { en?: unknown; ko?: unknown }
      | undefined;
    if (
      !rationale ||
      typeof rationale.en !== "string" ||
      typeof rationale.ko !== "string" ||
      [rationale.en, rationale.ko].some(
        (text) =>
          typeof text !== "string" ||
          normalizeEditorialText(text).split(" ").length < 3,
      )
    )
      violations.push(
        issue("weak_comparator", `comparators[${index}].rationale`),
      );
  });
  const unique = new Map<string, PublicationQualityViolation>();
  for (const violation of violations)
    unique.set(
      `${violation.code}|${violation.path}|${violation.relatedPath ?? ""}`,
      violation,
    );
  const distinct = [...unique.values()];
  const hardViolations = distinct.filter(
    (violation) => publicationViolationSeverity(violation) === "hard",
  );
  const softViolations = distinct.filter(
    (violation) => publicationViolationSeverity(violation) === "soft",
  );
  return {
    passed: distinct.length === 0,
    publishable: hardViolations.length === 0,
    violations: distinct,
    hardViolations,
    softViolations,
  };
}

const HARD_PUBLICATION_QUALITY_CODES = new Set<
  PublicationQualityViolation["code"]
>([
  "unsupported_number",
  "section_ownership_conflict",
  "qa_evidence_conflict",
  "qa_primary_claim_limit",
  "untyped_comparator",
  "unsafe_public_claim",
]);

export function publicationViolationSeverity(
  violation: PublicationQualityViolation,
): "hard" | "soft" {
  return HARD_PUBLICATION_QUALITY_CODES.has(violation.code) ? "hard" : "soft";
}

export function stableEditorialFailureReason(
  violations: readonly PublicationQualityViolation[],
): string {
  const first = [...violations].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`),
  )[0];
  return `editorial_quality_failed:${first?.code ?? "unknown"}`;
}

/**
 * Public fields are generated by several model-facing stages. Normalize only
 * their wording at the final boundary so an internal provider/tool phrase
 * cannot abort an otherwise grounded report or leak into the saved report.
 */
export function sanitizePrePublicationCandidate(
  candidate: PrePublicationEditorialCandidate,
): PrePublicationEditorialCandidate {
  return {
    ...candidate,
    position: {
      en: sanitizePublicEditorialText(candidate.position.en),
      ko: sanitizePublicEditorialText(candidate.position.ko),
    },
    rationale: {
      en: sanitizePublicEditorialText(candidate.rationale.en),
      ko: sanitizePublicEditorialText(candidate.rationale.ko),
    },
    sections: candidate.sections.map((section) => ({
      ...section,
      text: {
        en: sanitizePublicEditorialText(section.text.en),
        ko: sanitizePublicEditorialText(section.text.ko),
      },
      ...(section.checkpoint === undefined
        ? {}
        : {
            checkpoint: {
              en: sanitizePublicEditorialText(section.checkpoint.en),
              ko: sanitizePublicEditorialText(section.checkpoint.ko),
            },
          }),
    })),
    comparators: candidate.comparators.map((comparator) => ({
      ...comparator,
      rationale: {
        en: sanitizePublicEditorialText(comparator.rationale.en),
        ko: sanitizePublicEditorialText(comparator.rationale.ko),
      },
    })),
    anticipatedQuestions: candidate.anticipatedQuestions.map((question) => ({
      ...question,
      question: {
        en: sanitizePublicEditorialText(question.question.en),
        ko: sanitizePublicEditorialText(question.question.ko),
      },
      answer: {
        en: sanitizePublicEditorialText(question.answer.en),
        ko: sanitizePublicEditorialText(question.answer.ko),
      },
    })),
  };
}

export type TargetedRewriteRequest = Readonly<{
  attempt: 1;
  fieldPaths: readonly string[];
  violations: readonly PublicationQualityViolation[];
  permittedClaimIds: readonly string[];
  permittedEvidenceArtifactIds: readonly string[];
  permittedNumbers: readonly string[];
  untrustedCandidateJson: string;
}>;

export function deterministicMetadataRewrite(
  original: PrePublicationEditorialCandidate,
  request: TargetedRewriteRequest,
): PrePublicationEditorialCandidate {
  const rewritten = structuredClone(original) as {
    -readonly [K in keyof PrePublicationEditorialCandidate]: PrePublicationEditorialCandidate[K];
  };
  // This fallback is deliberately metadata-only. Prose quality must be
  // repaired by the evidence-owning model stage; appending labels or generic
  // sentences here created reader-visible AI slop without improving meaning.
  const sectionClaimOwners = new Set<string>();
  rewritten.sections = rewritten.sections.map((section, index) => ({
    ...section,
    claimIds: section.claimIds.filter((claimId) => {
      if (!request.fieldPaths.includes(`sections[${index}].claimIds`)) {
        sectionClaimOwners.add(claimId);
        return true;
      }
      if (sectionClaimOwners.has(claimId)) return false;
      sectionClaimOwners.add(claimId);
      return true;
    }),
  }));
  const decisionKeys = new Set<string>();
  rewritten.anticipatedQuestions = rewritten.anticipatedQuestions.map(
    (question, index) => {
      const path = `anticipatedQuestions[${index}].decisionKey`;
      const duplicate = decisionKeys.has(question.decisionKey);
      const decisionKey =
        duplicate && request.fieldPaths.includes(path)
          ? `${question.decisionKey}:${question.questionId}`
          : question.decisionKey;
      decisionKeys.add(decisionKey);
      return decisionKey === question.decisionKey
        ? question
        : { ...question, decisionKey };
    },
  );
  return rewritten;
}

export async function gateWithOneTargetedRewrite(
  original: PrePublicationEditorialCandidate,
  rewrite: (
    request: TargetedRewriteRequest,
  ) => Promise<PrePublicationEditorialCandidate>,
): Promise<
  Readonly<
    | {
        kind: "accepted";
        candidate: PrePublicationEditorialCandidate;
        rewritten: boolean;
        fieldLineage: Readonly<
          Record<string, "synthesis" | "targeted_rewrite">
        >;
      }
    | {
        kind: "rejected";
        reason: string;
        violations: readonly PublicationQualityViolation[];
      }
  >
> {
  const sanitizedOriginal = sanitizePrePublicationCandidate(original);
  const first = evaluatePrePublicationEditorialGate(sanitizedOriginal);
  const synthesisLineage = candidateFieldPaths(sanitizedOriginal);
  if (first.publishable)
    return {
      kind: "accepted",
      candidate: sanitizedOriginal,
      rewritten: false,
      fieldLineage: Object.fromEntries(
        synthesisLineage.map((path) => [path, "synthesis"]),
      ),
    };
  const paths = [
    ...new Set(
      first.violations.flatMap((entry) => [
        entry.path,
        ...(entry.relatedPath === undefined ? [] : [entry.relatedPath]),
      ]),
    ),
  ].sort();
  const rewritten = await rewrite({
    attempt: 1,
    fieldPaths: paths,
    violations: first.violations,
    permittedClaimIds: sanitizedOriginal.permittedClaimIds,
    permittedEvidenceArtifactIds:
      sanitizedOriginal.permittedEvidenceArtifactIds,
    permittedNumbers: sanitizedOriginal.supportedNumbers,
    untrustedCandidateJson: `<untrusted_editorial_candidate>${JSON.stringify(sanitizedOriginal)}</untrusted_editorial_candidate>`,
  });
  if (rewritten.confidence !== sanitizedOriginal.confidence)
    return {
      kind: "rejected",
      reason: "editorial_quality_failed:confidence_changed",
      violations: [],
    };
  const normalizedRewrite = sanitizePrePublicationCandidate(rewritten);
  const changedPaths = changedLeafPaths(
    sanitizedOriginal,
    normalizedRewrite,
  ).sort();
  const unpermittedChange = changedPaths.find(
    (path) =>
      !paths.some(
        (permitted) =>
          path === permitted ||
          path.startsWith(`${permitted}.`) ||
          path.startsWith(`${permitted}[`),
      ),
  );
  if (unpermittedChange !== undefined)
    return {
      kind: "rejected",
      reason: `editorial_quality_failed:rewrite_scope:${unpermittedChange}`,
      violations: [],
    };
  const second = evaluatePrePublicationEditorialGate(normalizedRewrite);
  if (!second.publishable)
    return {
      kind: "rejected",
      reason: stableEditorialFailureReason(second.hardViolations),
      violations: second.hardViolations,
    };
  return {
    kind: "accepted",
    candidate: normalizedRewrite,
    rewritten: changedPaths.length > 0,
    fieldLineage: Object.fromEntries([
      ...candidateFieldPaths(rewritten).map(
        (path) => [path, "synthesis"] as const,
      ),
      ...changedPaths.map((path) => [path, "targeted_rewrite"] as const),
    ]),
  };
}

function candidateFieldPaths(
  candidate: PrePublicationEditorialCandidate,
): readonly string[] {
  return leafPaths(candidate);
}

function leafPaths(value: unknown, path = ""): readonly string[] {
  if (Array.isArray(value))
    return value.length === 0
      ? [path]
      : value.flatMap((entry, index) => leafPaths(entry, `${path}[${index}]`));
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    return entries.length === 0
      ? [path]
      : entries.flatMap(([key, entry]) =>
          leafPaths(entry, path === "" ? key : `${path}.${key}`),
        );
  }
  return [path];
}

function changedLeafPaths(left: unknown, right: unknown, path = ""): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const changed = left.length === right.length ? [] : [`${path}.length`];
    for (
      let index = 0;
      index < Math.max(left.length, right.length);
      index += 1
    ) {
      if (index >= left.length || index >= right.length)
        changed.push(`${path}[${index}]`);
      else
        changed.push(
          ...changedLeafPaths(left[index], right[index], `${path}[${index}]`),
        );
    }
    return changed;
  }
  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    const changed: string[] = [];
    for (const key of [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort()) {
      const childPath = path === "" ? key : `${path}.${key}`;
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key))
        changed.push(childPath);
      else
        changed.push(
          ...changedLeafPaths(
            Reflect.get(left, key),
            Reflect.get(right, key),
            childPath,
          ),
        );
    }
    return changed;
  }
  return [path];
}
