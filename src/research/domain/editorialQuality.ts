export type EditorialLocale = "en" | "ko";

export const EDITORIAL_QUALITY_REASONS = [
  "exact_duplicate",
  "near_duplicate_en",
  "near_duplicate_ko",
  "public_field_overlap",
  "forbidden_public_vocabulary",
  "capability_leakage",
  "numeric_density",
  "unsupported_number",
  "section_ownership_conflict",
  "position_equals_rationale",
  "untyped_comparator",
  "qa_overlap",
  "generic_limitation_language",
  "semantic_repetition",
] as const;
export type EditorialQualityReason = (typeof EDITORIAL_QUALITY_REASONS)[number];
export const EDITORIAL_SIMILARITY_THRESHOLDS = Object.freeze({
  enContentWordJaccard: 0.68,
  enCharTrigramDice: 0.78,
  koWordBigramJaccard: 0.6,
  koNoSpaceCharTrigramDice: 0.72,
});
export type EditorialSimilarityMetric =
  | "en_content_word_jaccard"
  | "en_char_trigram_dice"
  | "ko_word_bigram_jaccard"
  | "ko_no_space_char_trigram_dice";

export function isSimilarityThresholdViolation(
  metric: EditorialSimilarityMetric,
  score: number,
): boolean {
  const threshold = {
    en_content_word_jaccard:
      EDITORIAL_SIMILARITY_THRESHOLDS.enContentWordJaccard,
    en_char_trigram_dice: EDITORIAL_SIMILARITY_THRESHOLDS.enCharTrigramDice,
    ko_word_bigram_jaccard: EDITORIAL_SIMILARITY_THRESHOLDS.koWordBigramJaccard,
    ko_no_space_char_trigram_dice:
      EDITORIAL_SIMILARITY_THRESHOLDS.koNoSpaceCharTrigramDice,
  }[metric];
  return score >= threshold;
}

const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
]);
const FORBIDDEN_PUBLIC_PHRASES = [
  "buy now",
  "sell now",
  "guaranteed return",
  "system message",
  "prompt injection",
  "insightsentry",
  "rapidapi",
  "provider limitation",
  "licensing restriction",
  "licensing limitation",
  "licensing constraint",
  "지금 매수",
  "지금 매도",
  "수익 보장",
  "시스템 메시지",
  "프롬프트 인젝션",
  "라이선스 제한",
  "라이선스 제약",
  "라이선싱 제한",
  "라이선싱 제약",
  "제공된 증거",
] as const;
const CAPABILITY_LEAK_PHRASES = [
  "provided data",
  "browse the",
  "browsing",
  "use tools",
  "tool access",
  "as an ai",
  "provider restriction",
  "data vendor limitation",
  "data vendor restriction",
  "internal schema",
  "tool use limitation",
  "tool-use limitation",
  "제공된 데이터",
  "브라우징",
  "도구를 사용",
  "도구 접근",
  "ai로서",
  "데이터 제공업체 제한",
  "데이터 제공 업체 제한",
  "제공업체 제한",
  "제공업체의 제한",
  "제공 업체 제한",
  "제공 업체의 제한",
  "데이터 공급자 제한",
  "데이터 공급자 제약",
  "데이터 공급자의 제한",
  "데이터 공급자의 제약",
  "데이터 벤더 제한",
  "데이터 벤더 제약",
  "데이터 벤더의 제한",
  "데이터 벤더의 제약",
  "내부 스키마",
  "도구 사용 제한",
  "도구 사용 제약",
] as const;

const GENERIC_LIMITATION_PATTERNS = [
  /(?:provided|available|supplied) (?:data|evidence|material)s? (?:alone )?(?:cannot|does not|is not enough)/iu,
  /(?:data|evidence|information) (?:is|are) (?:not available|insufficient)/iu,
  /(?:cannot|unable to) (?:confirm|determine|quantify|verify).{0,80}(?:with|from) (?:the )?(?:provided|available|current)/iu,
  /(?:제공된|확인 가능한|현재) (?:자료|데이터|근거)(?:만으로는|로는).{0,80}(?:확인|판단|확정|정량화)할 수 (?:없|어렵)/u,
  /(?:자료|데이터|근거)가 (?:없|부족).{0,80}(?:확인|판단|확정|정량화)할 수 (?:없|어렵)/u,
  /(?:분석 범위|확인 범위)(?:의)? (?:한계|제약)/u,
] as const;

const INTERPRETATION_PATTERNS = [
  /\b(?:because|therefore|implies?|indicates?|signals?|supports?|requires?|means?|leaves?|making|versus|compared|but|while|despite)\b/iu,
  /(?:때문|따라서|의미|시사|신호|뒷받침|요구|반영|부담|여지|조건|대비|반면|하지만|그럼에도|악화|개선|유지)/u,
] as const;

export function normalizeEditorialText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/\[(?:\d+|citation|source)[^\]]*\]/giu, " ")
    .replace(/\((?:source|citation|출처)\s*[:：]?[^)]*\)/giu, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function sanitizePublicEditorialText(value: string): string {
  // Publication no longer disguises weak prose through a word-for-word
  // substitution table. Actual prose repair belongs to the stage that owns
  // the evidence and can rewrite the whole thought. This boundary removes
  // only workflow scaffolding that is not part of the analyst's thought, then
  // normalizes invisible Unicode/spacing differences.
  return value
    .normalize("NFKC")
    .replace(
      /Reassess if official evidence no longer supports this claim:\s*/giu,
      "",
    )
    .replace(
      /공식 근거가 다음 주장을 더 이상 지지하지 않으면 재검토합니다:\s*/gu,
      "",
    )
    .replace(
      /이 항목은 확인 불가 문구로 끝내지 않고 감시 위험으로 둡니다\.\s*/gu,
      "이 항목은 다음 관찰 결과로 판별합니다. ",
    )
    .replace(
      /\bsealed snapshot\b/giu,
      "official evidence available at the report cutoff",
    )
    .replace(/봉인된 스냅샷/gu, "분석 기준 시점의 공식 자료")
    .replace(
      /(?:적격 )?(?:피어|동종기업) 데이터가 (?:훼손됐|손상됐|잘못됐|사용 불가능하)고?/gu,
      "동종기업 비교는 현재 판단의 핵심 근거로 사용하지 않았고",
    )
    .replace(
      /(?:qualified )?(?:peer|comparator) data (?:is|was) (?:malformed|corrupt|damaged|unusable)/giu,
      "peer comparison was not used as a decisive input",
    )
    .replace(/(\d{1,2})월\s*\$(\d{1,2})(?=\s|일|$)/gu, "$1월 $2일")
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\$(\d{1,2})(?![\d.])/giu,
      "$1 $2",
    )
    .replace(
      /((?:10년물|국채 ?금리|기준금리|금리)(?:은|는|이|가)?\s*)\$(\d+(?:\.\d+)?)/gu,
      "$1$2%",
    )
    .replace(
      /((?:10-year|Treasury|policy) (?:yield|rate)(?: is| was| remains| at)?\s*)\$(\d+(?:\.\d+)?)/giu,
      "$1$2%",
    )
    .replace(
      /((?:3개월|1년)(?: 기준)?(?: 수익률)?(?:은|는|이|가)?\s*)\$(\d+(?:\.\d+)?)\s*대\s*(?:음의\s*)?\$(\d+(?:\.\d+)?)/gu,
      "$1$2% 대 -$3%",
    )
    .replace(/\s+/gu, " ")
    .trim();
}

export function containsGenericLimitationLanguage(value: string): boolean {
  return GENERIC_LIMITATION_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsInvestmentInterpretation(value: string): boolean {
  return INTERPRETATION_PATTERNS.some((pattern) => pattern.test(value));
}

export function scoreSetJaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function scoreSetDice(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function ngrams(value: string, size: number): Set<string> {
  if (value.length <= size) return new Set(value.length === 0 ? [] : [value]);
  return new Set(
    Array.from({ length: value.length - size + 1 }, (_, index) =>
      value.slice(index, index + size),
    ),
  );
}

function wordBigrams(value: string): Set<string> {
  const words = value.split(" ").filter(Boolean);
  if (words.length < 2) return new Set(words);
  return new Set(
    words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`),
  );
}

export function textSimilarity(
  left: string,
  right: string,
  locale: EditorialLocale,
) {
  const normalizedLeft = normalizeEditorialText(left);
  const normalizedRight = normalizeEditorialText(right);
  const exact = normalizedLeft === normalizedRight;
  if (locale === "en") {
    const contentWords = (value: string) =>
      new Set(
        value
          .split(" ")
          .filter((word) => word.length > 1 && !ENGLISH_STOP_WORDS.has(word)),
      );
    const wordJaccard = scoreSetJaccard(
      contentWords(normalizedLeft),
      contentWords(normalizedRight),
    );
    const trigramDice = scoreSetDice(
      ngrams(normalizedLeft, 3),
      ngrams(normalizedRight, 3),
    );
    return {
      exact,
      wordJaccard,
      trigramDice,
      duplicate:
        exact ||
        isSimilarityThresholdViolation(
          "en_content_word_jaccard",
          wordJaccard,
        ) ||
        isSimilarityThresholdViolation("en_char_trigram_dice", trigramDice),
      reason: exact
        ? "exact_duplicate"
        : isSimilarityThresholdViolation(
              "en_content_word_jaccard",
              wordJaccard,
            ) ||
            isSimilarityThresholdViolation("en_char_trigram_dice", trigramDice)
          ? "near_duplicate_en"
          : undefined,
    } as const;
  }
  const wordBigramJaccard = scoreSetJaccard(
    wordBigrams(normalizedLeft),
    wordBigrams(normalizedRight),
  );
  const noSpaceTrigramDice = scoreSetDice(
    ngrams(normalizedLeft.replace(/\s/gu, ""), 3),
    ngrams(normalizedRight.replace(/\s/gu, ""), 3),
  );
  return {
    exact,
    wordBigramJaccard,
    noSpaceTrigramDice,
    duplicate:
      exact ||
      isSimilarityThresholdViolation(
        "ko_word_bigram_jaccard",
        wordBigramJaccard,
      ) ||
      isSimilarityThresholdViolation(
        "ko_no_space_char_trigram_dice",
        noSpaceTrigramDice,
      ),
    reason: exact
      ? "exact_duplicate"
      : isSimilarityThresholdViolation(
            "ko_word_bigram_jaccard",
            wordBigramJaccard,
          ) ||
          isSimilarityThresholdViolation(
            "ko_no_space_char_trigram_dice",
            noSpaceTrigramDice,
          )
        ? "near_duplicate_ko"
        : undefined,
  } as const;
}

export function extractNumericTokens(value: string): readonly string[] {
  return [
    ...value
      .normalize("NFKC")
      .matchAll(/(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)*(?:%|배)?/gu),
  ].map((match) => match[0].replace(/,/g, ""));
}

export function measureNumericDensity(value: string): number {
  const normalized = normalizeEditorialText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  return extractNumericTokens(value).length / tokens.length;
}

export function containsNumericDump(value: string): boolean {
  return (
    extractNumericTokens(value).length >= 4 &&
    measureNumericDensity(value) >= 0.5 &&
    !containsInvestmentInterpretation(value)
  );
}

const CONCEPT_PATTERNS: readonly Readonly<{
  key: string;
  pattern: RegExp;
}>[] = [
  { key: "revenue", pattern: /\b(?:revenue|sales)\b|매출/iu },
  { key: "margin", pattern: /\bmargin\b|마진|수익성/iu },
  { key: "growth", pattern: /\bgrowth\b|성장/iu },
  { key: "demand", pattern: /\bdemand\b|수요/iu },
  { key: "valuation", pattern: /\bvaluation\b|밸류에이션|고평가|저평가/iu },
  { key: "risk", pattern: /\b(?:risk|downside)\b|위험|하방/iu },
  { key: "cash", pattern: /\b(?:cash|cashflow)\b|현금|현금흐름/iu },
  { key: "earnings", pattern: /\b(?:earnings|profit)\b|이익|실적/iu },
  { key: "competition", pattern: /\b(?:competition|competitor)\b|경쟁/iu },
  { key: "customer", pattern: /\bcustomer\b|고객/iu },
  { key: "price", pattern: /\b(?:price|multiple)\b|주가|가격|배수/iu },
  { key: "returns", pattern: /\breturn\b|수익률/iu },
  {
    key: "positive",
    pattern: /\b(?:increase|improve|expand|strong)\w*\b|증가|개선|확대|강화/iu,
  },
  {
    key: "negative",
    pattern:
      /\b(?:decline|weaken|contract|deteriorate)\w*\b|감소|약화|축소|악화/iu,
  },
];

function meaningFingerprint(value: string): ReadonlySet<string> {
  return new Set(
    CONCEPT_PATTERNS.filter(({ pattern }) => pattern.test(value)).map(
      ({ key }) => key,
    ),
  );
}

export function meaningfullyRepeats(left: string, right: string): boolean {
  const conceptsLeft = meaningFingerprint(left);
  const conceptsRight = meaningFingerprint(right);
  const sharedConcepts = [...conceptsLeft].filter((key) =>
    conceptsRight.has(key),
  );
  const leftNumbers = new Set(extractNumericTokens(left));
  const rightNumbers = new Set(extractNumericTokens(right));
  const sharedNumbers = [...leftNumbers].filter((token) =>
    rightNumbers.has(token),
  );
  const sameDirection = ["positive", "negative"].some(
    (key) => conceptsLeft.has(key) && conceptsRight.has(key),
  );
  return (
    (sharedConcepts.length >= 2 && sharedNumbers.length >= 2) ||
    (sharedConcepts.length >= 3 && sameDirection)
  );
}

type QualityInput = Readonly<{
  locale: EditorialLocale;
  position: string;
  rationale: string;
  supportedNumbers: readonly string[];
  sections: readonly Readonly<{
    sectionKey: string;
    claimIds: readonly string[];
    text: string;
  }>[];
  comparators: readonly Readonly<Record<string, unknown>>[];
  anticipatedQuestions: readonly Readonly<{
    decisionKey: string;
    answer: string;
    primaryClaimIds?: readonly string[];
  }>[];
}>;

function phrasePresent(value: string, phrases: readonly string[]): boolean {
  const normalized = normalizeEditorialText(value);
  return phrases.some((phrase) =>
    normalized.includes(normalizeEditorialText(phrase)),
  );
}

export function containsForbiddenPublicVocabulary(value: string): boolean {
  return phrasePresent(value, FORBIDDEN_PUBLIC_PHRASES);
}

export function containsCapabilityLeakage(value: string): boolean {
  return phrasePresent(value, CAPABILITY_LEAK_PHRASES);
}

export type EditorialQualityIssue = Readonly<{
  reason: EditorialQualityReason;
  leftPath: string;
  rightPath?: string;
}>;

export function evaluateEditorialQuality(input: QualityInput): Readonly<{
  passed: boolean;
  reasons: readonly EditorialQualityReason[];
  issues: readonly EditorialQualityIssue[];
  metrics: Readonly<{ maxNumericDensity: number }>;
}> {
  type PublicField = Readonly<{
    path: string;
    text: string;
    kind: "position" | "rationale" | "section" | "qa";
    claimIds?: readonly string[];
    primaryClaimIds?: readonly string[];
  }>;
  const found = new Set<EditorialQualityReason>();
  const issues: EditorialQualityIssue[] = [];
  const addIssue = (
    reason: EditorialQualityReason,
    leftPath: string,
    rightPath?: string,
  ) => {
    found.add(reason);
    issues.push(
      rightPath === undefined
        ? { reason, leftPath }
        : { reason, leftPath, rightPath },
    );
  };
  const publicFields: readonly PublicField[] = [
    { path: "position", text: input.position, kind: "position" as const },
    { path: "rationale", text: input.rationale, kind: "rationale" as const },
    ...input.sections.map((section, index) => ({
      path: `sections[${index}].text`,
      text: section.text,
      kind: "section" as const,
      claimIds: section.claimIds,
    })),
    ...input.anticipatedQuestions.map((qa, index) => ({
      path: `anticipatedQuestions[${index}].answer`,
      text: qa.answer,
      kind: "qa" as const,
      primaryClaimIds: qa.primaryClaimIds ?? [],
    })),
  ];
  const publicTexts = publicFields.map((field) => field.text);
  if (
    normalizeEditorialText(input.position) ===
    normalizeEditorialText(input.rationale)
  )
    addIssue("position_equals_rationale", "rationale", "position");
  for (const field of publicFields) {
    if (containsForbiddenPublicVocabulary(field.text))
      addIssue("forbidden_public_vocabulary", field.path);
    if (containsCapabilityLeakage(field.text))
      addIssue("capability_leakage", field.path);
  }

  const densities = publicTexts.map(measureNumericDensity);
  publicFields.forEach((field) => {
    if (containsNumericDump(field.text))
      addIssue("numeric_density", field.path);
  });
  const supported = new Set(
    input.supportedNumbers.map((number) => number.replace(/,/g, "")),
  );
  for (const field of publicFields)
    if (
      extractNumericTokens(field.text).some((number) => !supported.has(number))
    )
      addIssue("unsupported_number", field.path);

  const owners = new Map<string, string>();
  input.sections.forEach((section, index) => {
    for (const claimId of section.claimIds) {
      const owner = owners.get(claimId);
      const path = `sections[${index}].claimIds`;
      if (owner !== undefined && owner !== path)
        addIssue("section_ownership_conflict", path, owner);
      else owners.set(claimId, path);
    }
  });
  for (let left = 0; left < publicFields.length; left += 1)
    for (let right = left + 1; right < publicFields.length; right += 1) {
      const leftField = publicFields[left]!;
      const rightField = publicFields[right]!;
      const similarity = textSimilarity(
        leftField.text,
        rightField.text,
        input.locale,
      );
      if (!similarity.duplicate || similarity.reason === undefined) continue;
      // A grounded Q&A deliberately restates report evidence, including a
      // falsifier whose claim ownership belongs to an earlier section. That is
      // a reader-facing retrieval path, not accidental copy. Keep duplicate
      // enforcement for section↔section and Q&A↔Q&A pairs.
      const qaSectionRestatement =
        (leftField.kind === "qa" &&
          rightField.kind === "section" &&
          (leftField.primaryClaimIds?.length ?? 0) > 0) ||
        (rightField.kind === "qa" &&
          leftField.kind === "section" &&
          (rightField.primaryClaimIds?.length ?? 0) > 0);
      if (qaSectionRestatement) continue;
      found.add(similarity.reason);
      issues.push({
        reason: similarity.reason,
        leftPath: leftField.path,
        rightPath: rightField.path,
      });
      addIssue("public_field_overlap", leftField.path, rightField.path);
      if (leftField.kind === "qa" && rightField.kind === "qa")
        addIssue("qa_overlap", leftField.path, rightField.path);
    }
  input.comparators.forEach((comparator, index) => {
    const base = `comparators[${index}]`;
    const role = Reflect.get(comparator, "role");
    if (
      ![
        "direct_competitor",
        "operating_comparable",
        "valuation_proxy",
      ].includes(String(role ?? ""))
    )
      addIssue("untyped_comparator", `${base}.role`);
    const rationale = Reflect.get(comparator, "rationale");
    if (
      typeof rationale !== "object" ||
      rationale === null ||
      typeof Reflect.get(rationale, "en") !== "string" ||
      String(Reflect.get(rationale, "en")).trim() === "" ||
      typeof Reflect.get(rationale, "ko") !== "string" ||
      String(Reflect.get(rationale, "ko")).trim() === ""
    )
      addIssue("untyped_comparator", `${base}.rationale`);
    const metricKeys = Reflect.get(comparator, "comparableMetricKeys");
    if (
      !Array.isArray(metricKeys) ||
      metricKeys.length === 0 ||
      metricKeys.some((key) => typeof key !== "string" || key.trim() === "")
    )
      addIssue("untyped_comparator", `${base}.comparableMetricKeys`);
    const displayEligibility = Reflect.get(comparator, "displayEligibility");
    const medianEligibility = Reflect.get(comparator, "medianEligibility");
    if (displayEligibility === false || medianEligibility === false)
      addIssue(
        "untyped_comparator",
        `${base}.${displayEligibility === false ? "displayEligibility" : "medianEligibility"}`,
      );
  });

  return {
    passed: found.size === 0,
    reasons: EDITORIAL_QUALITY_REASONS.filter((reason) => found.has(reason)),
    issues,
    metrics: { maxNumericDensity: Math.max(0, ...densities) },
  };
}

export type ConfidenceFacts = Readonly<{
  thesisMateriality: "material" | "supporting";
  semanticVerdict: "entailed" | "partial" | "contradicted" | "not_assessable";
  independentSourceClasses: readonly string[];
  authoritativeSourceClasses: readonly string[];
  criticalDataFreshness: "current" | "stale" | "unavailable";
  contradictionSeverity: "none" | "limited" | "severe";
  rewriteProse?: string;
}>;

export function deriveEditorialConfidence(
  facts: ConfidenceFacts,
): "high" | "medium" | "low" {
  if (facts.contradictionSeverity === "severe") return "low";
  const independentSources = new Set(facts.independentSourceClasses).size;
  if (
    facts.thesisMateriality === "material" &&
    facts.semanticVerdict === "entailed" &&
    independentSources >= 2 &&
    facts.criticalDataFreshness === "current"
  )
    return "high";
  if (
    (facts.semanticVerdict === "entailed" ||
      facts.semanticVerdict === "partial") &&
    new Set(facts.authoritativeSourceClasses).size >= 1
  )
    return "medium";
  return "low";
}
