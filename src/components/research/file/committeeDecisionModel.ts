import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import { workflowRoleById } from "../../../research/domain/roleRegistry";
import { formatSignedPercent } from "../../../research/publicPresentation";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

const stanceLabels = {
  upside_skewed: { en: "Upside skewed", ko: "상방 우위" },
  wait_for_proof: { en: "Wait for proof", ko: "확인 대기" },
  downside_skewed: { en: "Downside skewed", ko: "하방 우위" },
} as const;
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
  const seenDriverTexts = new Set<string>();
  const driverCandidates = [
    ...primaryClaims,
    ...activeClaims.filter(
      ({ claim }) =>
        !primaryIds.has(claim.claimId) &&
        claim.materiality === "material" &&
        claim.decisionDimension !== "catalyst",
    ),
  ];
  const drivers = driverCandidates
    .flatMap(({ claim, registered, departmentId, team, ownerName }) => {
      if (
        claim.materiality !== "material" ||
        claim.decisionDimension === "catalyst"
      )
        return [];
      const thesis = claim.publicThesis[locale];
      const falsifier = claim.falsifier[locale];
      const why = team.evidence;
      const normalizedThesis = normalized(thesis);
      if (
        normalizedThesis.length === 0 ||
        seenDriverTexts.has(normalizedThesis) ||
        normalized(why) === normalizedThesis ||
        normalized(why) === normalized(falsifier)
      )
        return [];
      seenDriverTexts.add(normalizedThesis);
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
          contribution: contributionLabels[claim.stanceContribution][locale],
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
    stanceLabel: stanceLabels[decision.stance][locale],
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
      const ownedClaims = claims.filter(
        (claim) =>
          workflowRoleById(claim.roleOwner)?.departmentId === team.departmentId,
      );
      const accepted = ownedClaims.some((claim) =>
        primaryIds.has(claim.claimId),
      );
      const opposed = ownedClaims.some(
        (claim) => claim.stanceContribution === "opposes",
      );
      return {
        ...team,
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
