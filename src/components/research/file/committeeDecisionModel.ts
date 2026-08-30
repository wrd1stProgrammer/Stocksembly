import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import { workflowRoleById } from "../../../research/domain/roleRegistry";
import { formatSignedPercent } from "../../../research/publicPresentation";
import { publicStanceLabel } from "../../../research/publicStanceLabels";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

const confidenceLabels = {
  high: { en: "High", ko: "높음" },
  medium: { en: "Medium", ko: "보통" },
  low: { en: "Low", ko: "낮음" },
} as const;
const contributionLabels = {
  supports: { en: "Supports the view", ko: "현재 판단을 지지" },
  opposes: { en: "Challenges the view", ko: "현재 판단에 반대" },
  uncertain: { en: "Context for the view", ko: "판단의 맥락" },
} as const;
const driverEvidenceLabels = {
  primary: { en: "Primary evidence", ko: "핵심 근거" },
  supporting: { en: "Supporting evidence", ko: "보강 근거" },
} as const;

function dateFromText(value: string): string | undefined {
  return value.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0];
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editorialTokens(value: string): ReadonlySet<string> {
  return new Set(
    normalized(value)
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

function editoriallyOverlaps(first: string, second: string): boolean {
  const firstTokens = editorialTokens(first);
  const secondTokens = editorialTokens(second);
  const smaller = Math.min(firstTokens.size, secondTokens.size);
  if (smaller < 6) return normalized(first) === normalized(second);
  let shared = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) shared += 1;
  }
  return shared / smaller >= 0.72;
}

function decisionDriverTheme(dimension: string): string {
  if (
    [
      "relative_performance",
      "growth_engine",
      "moat",
      "adoption",
      "competitive_erosion",
    ].includes(dimension)
  )
    return "business";
  if (dimension === "embedded_expectations") return "valuation";
  if (["downside_path", "leading_indicator", "mitigant"].includes(dimension))
    return "risk";
  if (["margin", "cash_conversion", "reinvestment"].includes(dimension))
    return "financial";
  if (["regime", "timing", "catalyst"].includes(dimension)) return "market";
  return dimension;
}

const driverThemePriority: Readonly<Record<string, number>> = {
  business: 0,
  valuation: 1,
  risk: 2,
  financial: 3,
  market: 4,
};

const COMPARATOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
  NVDA: ["NVDA", "NVIDIA", "엔비디아", "앤비디아", "앤디비아"],
  AMD: ["AMD", "Advanced Micro Devices", "암드"],
  AAPL: ["AAPL", "Apple", "애플"],
  MSFT: ["MSFT", "Microsoft", "마이크로소프트"],
  AMZN: ["AMZN", "Amazon", "아마존"],
  TSLA: ["TSLA", "Tesla", "테슬라"],
  GOOGL: ["GOOGL", "Alphabet", "Google", "알파벳", "구글"],
  META: ["META", "Meta", "메타"],
  AVGO: ["AVGO", "Broadcom", "브로드컴"],
  INTC: ["INTC", "Intel", "인텔"],
  QCOM: ["QCOM", "Qualcomm", "퀄컴"],
};

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectedComparatorLabel(
  question: string,
  decisiveReason: string,
  comparatorIds: readonly string[],
  locale: Locale,
): string | undefined {
  if (!asksForRelativeComparison(question) || comparatorIds.length === 0)
    return undefined;
  for (const comparatorId of comparatorIds) {
    const symbol = comparatorId.split(":").at(-1)?.toUpperCase();
    if (symbol === undefined) continue;
    const aliases = COMPARATOR_ALIASES[symbol] ?? [symbol];
    const selected = aliases.some((alias) => {
      const escaped = escapedPattern(alias);
      return locale === "ko"
        ? new RegExp(
            `(?:보다|대신).{0,24}${escaped}(?:가|이)?\\s*(?:더\\s*)?(?:적합|유리|우위)|(?:선택|우선).{0,12}${escaped}|${escaped}(?:가|이)?\\s*(?:더\\s*)?(?:적합|유리|우위)`,
            "iu",
          ).test(decisiveReason)
        : new RegExp(
            `(?:prefer|choose)\\s+${escaped}|${escaped}.{0,20}(?:stronger fit|preferred|more attractive)`,
            "iu",
          ).test(decisiveReason);
    });
    if (selected)
      return locale === "ko" ? `${symbol} 우선` : `Prefer ${symbol}`;
  }
  return locale === "ko" ? "상대 우위 판단" : "Relative preference";
}

function asksForRelativeComparison(question: string): boolean {
  return /(?:동종|업계|섹터|벤치마크|상대|경쟁사.{0,12}비교|살\s*바에|사는\s*게|보다.{0,12}(?:낫|좋|유리)|대신.{0,12}(?:사|투자)|peer|comparator|benchmark|relative|versus|\bvs\.?\b)/iu.test(
    question,
  );
}

function isComparatorAbsenceClaim(value: {
  readonly en: string;
  readonly ko: string;
}): boolean {
  const text = `${value.en} ${value.ko}`;
  const subject =
    /(?:peer|comparator|benchmark|relative comparison|동종기업|피어|벤치마크|상대 비교)/iu;
  const absence =
    /(?:missing|absent|unavailable|not available|cannot verify|없|부재|확인할 수 없|사용할 수 없)/iu;
  return subject.test(text) && absence.test(text);
}

export function buildCommitteeDecisionModel(
  file: ResearchFileData,
  model: ResearchFileEditorialModel,
  locale: Locale,
) {
  const decision = model.structuredDecision;
  const claims = model.structuredClaims ?? [];
  if (decision === undefined) return undefined;
  const claimRegister = file.structuredEditorial?.claimRegister ?? [];
  const registerById = new Map(
    claimRegister.map((claim) => [claim.claimId, claim]),
  );
  const sourceRegistry = new Set<string>(
    file.evidenceIndex.map((source) => source.id),
  );
  const authenticate = (claim: (typeof claims)[number]) => {
    const registered = registerById.get(claim.claimId);
    if (registered === undefined) return undefined;
    // The public evidence index deliberately omits internal bookkeeping
    // artifacts (for example request ledgers). A claim remains publishable as
    // long as at least one of its cited artifacts is public and the public
    // portion is registered. Previously one omitted internal artifact caused
    // the entire claim to disappear from the reader-facing report.
    const registeredPublicSourceIds = new Set<string>(
      registered.sourceIds
        .filter((sourceId) => sourceRegistry.has(sourceId))
        .map(String),
    );
    const publicEvidenceIds = claim.evidenceArtifactIds.filter((sourceId) =>
      sourceRegistry.has(sourceId),
    );
    const publicCounterevidenceIds = claim.counterevidenceArtifactIds.filter(
      (sourceId) => sourceRegistry.has(sourceId),
    );
    if (
      (registered.disposition !== "accepted" &&
        registered.disposition !== "revised") ||
      (registered.disposition === "revised" &&
        (registered.originClaimId === undefined ||
          registered.originClaimId === registered.claimId ||
          registered.revisionHash === undefined)) ||
      registeredPublicSourceIds.size === 0 ||
      publicEvidenceIds.length === 0 ||
      [...publicEvidenceIds, ...publicCounterevidenceIds].some(
        (sourceId) => !registeredPublicSourceIds.has(String(sourceId)),
      )
    )
      return undefined;
    const role = workflowRoleById(claim.roleOwner);
    const departmentId = role?.departmentId;
    if (
      role === undefined ||
      departmentId === undefined ||
      departmentId === "chair"
    )
      return undefined;
    const team = model.teamRows.find(
      (candidate) => candidate.departmentId === departmentId,
    );
    if (team === undefined) return undefined;
    return { claim, registered, departmentId, team, ownerName: role.name };
  };
  const activeClaims = claims.flatMap((claim) => {
    if (
      !asksForRelativeComparison(model.question) &&
      isComparatorAbsenceClaim(claim.publicThesis)
    )
      return [];
    const authenticated = authenticate(claim);
    return authenticated === undefined ? [] : [authenticated];
  });
  const primaryIds = new Set(decision.primaryClaimIds);
  const primaryClaims = decision.primaryClaimIds.flatMap((claimId) => {
    const claim = activeClaims.find(
      (candidate) => candidate.claim.claimId === claimId,
    );
    return claim === undefined ? [] : [claim];
  });
  const rankedClaims = [
    ...primaryClaims,
    ...activeClaims.filter(({ claim }) => !primaryIds.has(claim.claimId)),
  ];
  const catalystClaims = activeClaims.filter(
    ({ claim }) => claim.decisionDimension === "catalyst",
  );
  const nextEventClaim = catalystClaims[0];
  const nextEvent = nextEventClaim?.claim.publicThesis[locale].trim() ?? "";
  const nextEventDate = dateFromText(nextEvent);
  const reliability =
    model.evidenceReliability >= 75
      ? confidenceLabels.high[locale]
      : model.evidenceReliability >= 50
        ? confidenceLabels.medium[locale]
        : confidenceLabels.low[locale];
  const seenDriverTexts: string[] = [];
  const openingTexts = [model.directAnswer, ...model.investmentView].filter(
    (value) => value.trim().length > 0,
  );
  const driverCandidates = [
    ...primaryClaims.map((candidate, order) => ({ candidate, order })),
    ...activeClaims
      .filter(
        ({ claim }) =>
          !primaryIds.has(claim.claimId) &&
          claim.materiality === "material" &&
          claim.decisionDimension !== "catalyst",
      )
      .map((candidate, index) => ({
        candidate,
        order: primaryClaims.length + index,
      })),
  ].sort((first, second) => {
    const firstTheme = decisionDriverTheme(
      first.candidate.claim.decisionDimension,
    );
    const secondTheme = decisionDriverTheme(
      second.candidate.claim.decisionDimension,
    );
    return (
      (driverThemePriority[firstTheme] ?? 99) -
        (driverThemePriority[secondTheme] ?? 99) || first.order - second.order
    );
  });
  const seenDriverThemes = new Set<string>();
  const drivers = driverCandidates
    .flatMap(({ candidate }) => {
      const { claim, registered, departmentId, team, ownerName } = candidate;
      if (
        claim.materiality !== "material" ||
        claim.decisionDimension === "catalyst"
      )
        return [];
      const thesis = claim.publicThesis[locale];
      const falsifier = claim.falsifier[locale];
      const why = team.evidence;
      const normalizedThesis = normalized(thesis);
      const theme = decisionDriverTheme(claim.decisionDimension);
      if (
        normalizedThesis.length === 0 ||
        seenDriverThemes.has(theme) ||
        openingTexts.some((opening) => editoriallyOverlaps(opening, thesis)) ||
        seenDriverTexts.some((seen) => editoriallyOverlaps(seen, thesis)) ||
        normalized(why) === normalizedThesis ||
        normalized(why) === normalized(falsifier)
      )
        return [];
      seenDriverTexts.push(thesis);
      seenDriverThemes.add(theme);
      return [
        {
          id: claim.claimId,
          owner: ownerName,
          portraitPath: team.portraitPath,
          departmentId,
          decisionDimension: claim.decisionDimension,
          materiality: claim.materiality,
          thesis,
          why,
          falsifier,
          contribution: primaryIds.has(claim.claimId)
            ? driverEvidenceLabels.primary[locale]
            : driverEvidenceLabels.supporting[locale],
          sourceLineage: {
            departmentId,
            disposition: registered.disposition,
            originClaimId: registered.originClaimId,
            registerSourceIds: registered.sourceIds,
            evidenceArtifactIds: claim.evidenceArtifactIds,
          },
        },
      ];
    })
    .slice(0, 3)
    .map((driver, index) => ({ ...driver, rank: index + 1 }));
  return {
    stance: decision.stance,
    stanceLabel:
      selectedComparatorLabel(
        model.question,
        decision.decisiveReason[locale],
        model.qualifiedComparators?.map((item) => item.comparatorId) ?? [],
        locale,
      ) ?? publicStanceLabel(decision.stance, locale),
    confidence: decision.confidence,
    confidenceLabel: confidenceLabels[decision.confidence][locale],
    reliability,
    decisiveReason: decision.decisiveReason[locale],
    countercase: decision.strongestCountercase[locale],
    falsifier:
      file.reportDecisionFalsifier?.[locale] ?? decision.falsifier[locale],
    price:
      file.marketSnapshot === undefined
        ? undefined
        : {
            value: `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`,
            change:
              file.marketSnapshot.changePercent === undefined
                ? file.marketSnapshot.change
                : formatSignedPercent(file.marketSnapshot.changePercent),
          },
    drivers,
    nextEvent:
      nextEvent.length === 0 || nextEventClaim === undefined
        ? undefined
        : {
            id: nextEventClaim.claim.claimId,
            disposition: nextEventClaim.registered.disposition,
            sourceIds: nextEventClaim.registered.sourceIds,
            label:
              nextEventDate === undefined
                ? nextEvent
                : nextEvent.replace(nextEventDate, "").trim(),
            date: nextEventDate,
          },
    adjudicationRows: model.teamRows.map((team) => {
      const ownedClaims = activeClaims
        .filter(({ departmentId }) => departmentId === team.departmentId)
        .map(({ claim }) => claim);
      const accepted = ownedClaims.some((claim) =>
        primaryIds.has(claim.claimId),
      );
      const opposed = ownedClaims.some(
        (claim) => claim.stanceContribution === "opposes",
      );
      return {
        ...team,
        investorCheckpoint:
          ownedClaims.find((claim) => claim.materiality === "material")
            ?.falsifier[locale] ??
          ownedClaims[0]?.falsifier[locale] ??
          model.nextVerificationEvent,
        adjudication: accepted
          ? locale === "ko"
            ? "핵심 동인 채택"
            : "Accepted driver"
          : opposed
            ? locale === "ko"
              ? "반대 논거 보존"
              : "Countercase retained"
            : locale === "ko"
              ? "맥락 근거 반영"
              : "Context retained",
      };
    }),
    valuationRows: model.comparisonRows,
    valuationConclusion: model.valuationConclusion.trim(),
    scenarios: model.scenarios.filter(
      (scenario) => scenario.assumptions.length > 0,
    ),
    // The first catalyst is already presented as the cockpit's next event.
    // Keep only follow-on events here so the same claim is not repeated twice.
    catalysts: catalystClaims.slice(1).map(({ claim, registered }) => ({
      id: claim.claimId,
      disposition: registered.disposition,
      sourceIds: registered.sourceIds,
      headline: claim.publicThesis[locale],
      body: claim.falsifier[locale],
      date: dateFromText(claim.publicThesis[locale]),
    })),
    ownedAnalysis: rankedClaims
      .filter(
        ({ claim }) =>
          !primaryIds.has(claim.claimId) &&
          claim.decisionDimension !== "catalyst" &&
          normalized(claim.publicThesis[locale]) !== normalized(nextEvent),
      )
      .slice(0, 4)
      .map(({ claim, registered, departmentId, team, ownerName }) => ({
        id: claim.claimId,
        owner: ownerName,
        portraitPath: team.portraitPath,
        departmentId,
        dimension: claim.decisionDimension,
        contribution: contributionLabels[claim.stanceContribution][locale],
        disposition: registered.disposition,
        sourceIds: registered.sourceIds,
        thesis: claim.publicThesis[locale],
        falsifier: claim.falsifier[locale],
      })),
  };
}
