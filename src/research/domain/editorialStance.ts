export const EDITORIAL_STANCE_CONTRACT_VERSION = "editorial-stance-v1" as const;

export type EditorialStance =
  | "upside_skewed"
  | "downside_skewed"
  | "balanced"
  | "insufficient_evidence";

export type EditorialStanceInput = Readonly<{
  issuerSecurity: string;
  metricOrEventIdentity: string;
  periodOrAsOf: string;
  direction: string;
  materiality: string;
  sourceQualified: boolean;
  semanticQualified: boolean;
}>;

type Direction = "upside" | "downside";
type Materiality = "material" | "supporting";

export type EvaluatedEditorialInput = Readonly<{
  underlyingInputKey: string;
  status: "eligible" | "contested";
  direction?: Direction;
  materiality?: Materiality;
  directionalWeight: 0 | 1 | 2;
}>;

export type EditorialStanceEvaluation = Readonly<{
  contractVersion: typeof EDITORIAL_STANCE_CONTRACT_VERSION;
  stance: EditorialStance;
  directionalWeights: Readonly<{ upside: number; downside: number }>;
  inputs: readonly EvaluatedEditorialInput[];
  countercaseUnderlyingInputKeys: readonly string[];
}>;

type DirectionalCounts = Readonly<{
  material: number;
  supporting: number;
}>;

type EligibleInput = Readonly<{
  underlyingInputKey: string;
  direction: Direction;
  materiality: Materiality;
}>;

function normalizedKeyPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .trim()
    .replace(/\s+/gu, " ");
}

function underlyingInputKey(input: EditorialStanceInput): string | undefined {
  const parts = [
    input.issuerSecurity,
    input.metricOrEventIdentity,
    input.periodOrAsOf,
  ].map(normalizedKeyPart);
  return parts.every((part) => part.length > 0) ? parts.join("|") : undefined;
}

function direction(value: string): Direction | undefined {
  return value === "upside" || value === "downside" ? value : undefined;
}

function materiality(value: string): Materiality | undefined {
  return value === "material" || value === "supporting" ? value : undefined;
}

function toEligibleInput(
  input: EditorialStanceInput,
): EligibleInput | undefined {
  const key = underlyingInputKey(input);
  const inputDirection = direction(input.direction);
  const inputMateriality = materiality(input.materiality);
  if (
    key === undefined ||
    inputDirection === undefined ||
    inputMateriality === undefined ||
    !input.sourceQualified ||
    !input.semanticQualified
  )
    return undefined;
  return {
    underlyingInputKey: key,
    direction: inputDirection,
    materiality: inputMateriality,
  };
}

function countInput(
  counts: DirectionalCounts,
  input: EvaluatedEditorialInput,
): DirectionalCounts {
  if (input.status !== "eligible" || input.materiality === undefined)
    return counts;
  return input.materiality === "material"
    ? { ...counts, material: counts.material + 1 }
    : { ...counts, supporting: counts.supporting + 1 };
}

function meetsDirectionalThreshold(counts: DirectionalCounts): boolean {
  return (
    counts.material >= 2 || (counts.material >= 1 && counts.supporting >= 2)
  );
}

export function evaluateEditorialStance(
  inputs: readonly EditorialStanceInput[],
): EditorialStanceEvaluation {
  const grouped = new Map<string, EligibleInput[]>();
  for (const rawInput of inputs) {
    const eligible = toEligibleInput(rawInput);
    if (eligible === undefined) continue;
    const group = grouped.get(eligible.underlyingInputKey) ?? [];
    group.push(eligible);
    grouped.set(eligible.underlyingInputKey, group);
  }
  const evaluatedInputs: EvaluatedEditorialInput[] = [];
  for (const [key, group] of grouped) {
    const directions = new Set(group.map((input) => input.direction));
    if (directions.size > 1) {
      evaluatedInputs.push({
        underlyingInputKey: key,
        status: "contested",
        directionalWeight: 0,
      });
      continue;
    }
    const first = group[0];
    if (first === undefined) continue;
    const resolvedMateriality = group.some(
      (input) => input.materiality === "material",
    )
      ? "material"
      : "supporting";
    evaluatedInputs.push({
      underlyingInputKey: key,
      status: "eligible",
      direction: first.direction,
      materiality: resolvedMateriality,
      directionalWeight: resolvedMateriality === "material" ? 2 : 1,
    });
  }
  const upside = evaluatedInputs
    .filter((input) => input.direction === "upside")
    .reduce((total, input) => total + input.directionalWeight, 0);
  const downside = evaluatedInputs
    .filter((input) => input.direction === "downside")
    .reduce((total, input) => total + input.directionalWeight, 0);
  const upsideCounts = evaluatedInputs
    .filter((input) => input.direction === "upside")
    .reduce(countInput, { material: 0, supporting: 0 });
  const downsideCounts = evaluatedInputs
    .filter((input) => input.direction === "downside")
    .reduce(countInput, { material: 0, supporting: 0 });
  const stance =
    meetsDirectionalThreshold(upsideCounts) && upside - downside >= 2
      ? "upside_skewed"
      : meetsDirectionalThreshold(downsideCounts) && downside - upside >= 2
        ? "downside_skewed"
        : upside > 0 && downside > 0
          ? "balanced"
          : "insufficient_evidence";
  return {
    contractVersion: EDITORIAL_STANCE_CONTRACT_VERSION,
    stance,
    directionalWeights: { upside, downside },
    inputs: evaluatedInputs,
    countercaseUnderlyingInputKeys: evaluatedInputs
      .filter((input) => input.status === "contested")
      .map((input) => input.underlyingInputKey),
  };
}

export type EditorialItemDefectInput = Readonly<{
  text: string;
  direction: string;
  repairAttempt: number;
}>;

export type EditorialItemDefectResolution =
  | Readonly<{ kind: "accepted"; reportDisposition: "complete" }>
  | Readonly<{
      kind: "rewrite_required";
      attempt: 1;
      suggestedText: string;
      reason: "direct_order_imperative" | "generic_posture_repeated";
    }>
  | Readonly<{
      kind: "omitted";
      reportDisposition: "complete_with_limitations";
      qualityDeduction: true;
      reason: "direct_order_imperative" | "generic_posture_repeated";
    }>;

function normalizedText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

function directOrderDirection(text: string): Direction | undefined {
  const normalized = normalizedText(text);
  if (/\b(?:buy)\s+now\b/iu.test(normalized) || /지금\s*매수/u.test(normalized))
    return "upside";
  if (
    /\b(?:sell)\s+now\b/iu.test(normalized) ||
    /즉시\s*매도/u.test(normalized)
  )
    return "downside";
  return undefined;
}

function genericPostureCount(text: string): number {
  return [
    /\bwait\b/iu,
    /\bconditional\b/iu,
    /\bneeds?\s+confirmation\b/iu,
    /대기/u,
    /조건부/u,
    /확인\s*필요/u,
  ].reduce((count, pattern) => {
    const flags = pattern.flags.includes("g")
      ? pattern.flags
      : `${pattern.flags}g`;
    return count + [...text.matchAll(new RegExp(pattern.source, flags))].length;
  }, 0);
}

function evidenceLanguage(direction: string): string {
  if (direction === "downside") return "Downside evidence dominates.";
  return "Upside evidence dominates.";
}

export function resolveEditorialItemDefect(
  input: EditorialItemDefectInput,
): EditorialItemDefectResolution {
  const orderDirection = directOrderDirection(input.text);
  const reason =
    orderDirection === undefined
      ? genericPostureCount(input.text) > 1
        ? "generic_posture_repeated"
        : undefined
      : "direct_order_imperative";
  if (reason === undefined)
    return { kind: "accepted", reportDisposition: "complete" };
  if (input.repairAttempt <= 0)
    return {
      kind: "rewrite_required",
      attempt: 1,
      suggestedText: evidenceLanguage(orderDirection ?? input.direction),
      reason,
    };
  return {
    kind: "omitted",
    reportDisposition: "complete_with_limitations",
    qualityDeduction: true,
    reason,
  };
}

export type EditorialNarrativeContractInput = Readonly<{
  stance: EditorialStance;
  firstSentence: string;
  countercase: Readonly<{ sectionKey: string; text: string }>;
  invalidation: Readonly<{ sectionKey: string; text: string }>;
  coreSections: readonly string[];
}>;

export type EditorialNarrativeContractEvaluation = Readonly<{
  passed: boolean;
  violations: readonly (
    | "first_sentence_direction_missing"
    | "countercase_section_invalid"
    | "countercase_missing"
    | "invalidation_section_invalid"
    | "invalidation_missing"
    | "generic_posture_repeated"
  )[];
}>;

function firstSentenceStatesStance(
  stance: EditorialStance,
  sentence: string,
): boolean {
  const normalized = normalizedText(sentence);
  const phrases = {
    upside_skewed: /(?:upside evidence|상방 근거|상승 근거)/u,
    downside_skewed: /(?:downside evidence|하방 근거|하락 근거)/u,
    balanced: /(?:evidence (?:is )?balanced|근거가 균형)/u,
    insufficient_evidence: /(?:evidence (?:is )?insufficient|근거가 부족)/u,
  } as const;
  return phrases[stance].test(normalized);
}

export function evaluateEditorialNarrativeContract(
  input: EditorialNarrativeContractInput,
): EditorialNarrativeContractEvaluation {
  const violations: EditorialNarrativeContractEvaluation["violations"][number][] =
    [];
  if (!firstSentenceStatesStance(input.stance, input.firstSentence))
    violations.push("first_sentence_direction_missing");
  if (input.countercase.text.trim().length === 0)
    violations.push("countercase_missing");
  if (input.countercase.sectionKey !== "dissent_unknowns")
    violations.push("countercase_section_invalid");
  if (input.invalidation.text.trim().length === 0)
    violations.push("invalidation_missing");
  if (input.invalidation.sectionKey !== "change_conditions")
    violations.push("invalidation_section_invalid");
  if (
    input.coreSections.reduce(
      (count, section) => count + genericPostureCount(section),
      0,
    ) > 1
  )
    violations.push("generic_posture_repeated");
  return { passed: violations.length === 0, violations };
}
