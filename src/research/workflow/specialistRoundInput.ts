import type { z } from "zod";
import type { SpecialistAssignmentV1 } from "../application/assignAllAgentsContracts";
import type { EditorialDecisionDimensionSchema } from "../domain/agentOutputsShared";
import { hashCanonical } from "../domain/contractHelpers";
import {
  AttemptIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  QuestionIdSchema,
} from "../domain/ids";
import type { ResearchProfile } from "../domain/researchProfile";
import { DEFAULT_RESEARCH_PROFILE } from "../domain/researchProfile";
import {
  type SpecialistRoleId,
  WORKFLOW_V1_SPECIALIST_IDS,
  workflowRoleById,
} from "../domain/roleRegistry";
import type { ValueRecord } from "../domain/valueRegistry";
import type {
  SpecialistClaimSlot,
  SpecialistJobRequest,
  SpecialistMemoCandidate,
  SpecialistRoundInput,
} from "./specialistRoundContracts";
import { SpecialistMemoCandidateSchema } from "./specialistRoundContracts";

const PRICE_MENTION =
  /(?:[$€£¥₩]|\b(?:price|price target|current price|multiple)\b|(?:가격|주가|목표가|배수))/iu;
const PRICE_ENABLED_ROLES = new Set<SpecialistRoleId>([
  "market_news",
  "benchmark",
  "valuation",
]);

type ClaimSlotBlueprint = {
  readonly decisionDimension: z.infer<typeof EditorialDecisionDimensionSchema>;
  readonly analyticalAngle: string;
  readonly optional?: boolean;
};

/**
 * A focused report used to accept one broad sentence from each specialist.
 * These role-owned angles force the team to produce a research package: at
 * least six distinct, decision-relevant observations without inventing new
 * roles or letting the publication layer pad sparse output.
 */
const ROLE_CLAIM_BLUEPRINTS = {
  market: [
    {
      decisionDimension: "regime",
      analyticalAngle: "demand breadth and market participation",
    },
    {
      decisionDimension: "regime",
      analyticalAngle: "rates, inflation, liquidity, and macro transmission",
    },
    {
      decisionDimension: "catalyst",
      analyticalAngle:
        "dated catalyst and the market reaction required for confirmation",
      optional: true,
    },
  ],
  market_news: [
    {
      decisionDimension: "timing",
      analyticalAngle: "multi-timeframe trend, support, and resistance",
    },
    {
      decisionDimension: "timing",
      analyticalAngle: "volume, momentum, and flow confirmation",
    },
  ],
  benchmark: [
    {
      decisionDimension: "relative_performance",
      analyticalAngle: "relative strength versus the qualified peer or sector",
    },
    {
      decisionDimension: "relative_performance",
      analyticalAngle:
        "valuation and operating context behind the relative move",
    },
  ],
  company: [
    {
      decisionDimension: "growth_engine",
      analyticalAngle: "segment and customer mix driving repeatable growth",
    },
    {
      decisionDimension: "growth_engine",
      analyticalAngle:
        "management execution, capacity, and capital-allocation proof",
    },
  ],
  company_product: [
    {
      decisionDimension: "adoption",
      analyticalAngle: "production adoption and customer-use evidence",
    },
    {
      decisionDimension: "adoption",
      analyticalAngle: "product economics, monetization, and retention",
    },
  ],
  company_competition: [
    {
      decisionDimension: "moat",
      analyticalAngle: "switching costs, ecosystem, and distribution advantage",
    },
    {
      decisionDimension: "competitive_erosion",
      analyticalAngle: "credible competitor or customer-substitution path",
    },
    {
      decisionDimension: "moat",
      analyticalAngle: "next operating milestone that proves moat durability",
      optional: true,
    },
  ],
  financial: [
    {
      decisionDimension: "margin",
      analyticalAngle: "gross and operating margin durability",
    },
    {
      decisionDimension: "reinvestment",
      analyticalAngle: "capital intensity, returns, and reinvestment runway",
    },
    {
      decisionDimension: "margin",
      analyticalAngle: "mix and operating leverage bridge",
      optional: true,
    },
  ],
  valuation: [
    {
      decisionDimension: "embedded_expectations",
      analyticalAngle:
        "growth and margin path implied by the observed valuation",
    },
    {
      decisionDimension: "embedded_expectations",
      analyticalAngle:
        "relative valuation, downside tolerance, and rerating trigger",
    },
  ],
  financial_quality: [
    {
      decisionDimension: "cash_conversion",
      analyticalAngle: "earnings-to-free-cash-flow conversion",
    },
    {
      decisionDimension: "cash_conversion",
      analyticalAngle: "working capital, dilution, and balance-sheet quality",
    },
  ],
  risk: [
    {
      decisionDimension: "downside_path",
      analyticalAngle: "highest-impact operating failure path",
    },
    {
      decisionDimension: "leading_indicator",
      analyticalAngle: "earliest measurable warning signal and threshold",
    },
    {
      decisionDimension: "downside_path",
      analyticalAngle:
        "compound risk transmission into revenue, margin, cash, or valuation",
    },
  ],
  risk_policy: [
    {
      decisionDimension: "mitigant",
      analyticalAngle: "balance-sheet or operating buffer",
    },
    {
      decisionDimension: "leading_indicator",
      analyticalAngle: "policy, macro, or governance escalation trigger",
    },
    {
      decisionDimension: "mitigant",
      analyticalAngle: "recovery condition and management response capacity",
    },
  ],
} as const satisfies Record<SpecialistRoleId, readonly ClaimSlotBlueprint[]>;

function deterministicUuid(seed: unknown): string {
  const hash = hashCanonical(seed);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function allocateSpecialistClaimSlots(
  identity: {
    readonly runId: string;
    readonly snapshotId: string;
    readonly roleId: SpecialistRoleId;
  },
  profile: ResearchProfile = DEFAULT_RESEARCH_PROFILE,
): readonly SpecialistClaimSlot[] {
  return ROLE_CLAIM_BLUEPRINTS[identity.roleId].map((blueprint, index) => ({
    claimId: ClaimIdSchema.parse(
      deterministicUuid({
        runId: identity.runId,
        snapshotId: identity.snapshotId,
        roleId: identity.roleId,
        decisionDimension: blueprint.decisionDimension,
        analyticalAngle: blueprint.analyticalAngle,
        slotIndex: index,
        kind: "specialist-claim-slot",
      }),
    ),
    decisionDimension: blueprint.decisionDimension,
    analyticalAngle: blueprint.analyticalAngle,
    materiality: index === 0 ? "material" : "supporting",
    optional:
      profile.analysisDepth === "core"
        ? index > 0
        : profile.analysisDepth === "deep"
          ? false
          : "optional" in blueprint
            ? blueprint.optional
            : false,
  }));
}

function registeredValuesFor(
  assignment: SpecialistAssignmentV1,
  values: readonly ValueRecord[],
): readonly ValueRecord[] {
  const allowedDatasets = new Set<string>(assignment.allowedDatasets);
  const counts = new Map<string, number>();
  const selected: ValueRecord[] = [];
  for (const value of [...values].reverse()) {
    const providerDataset = value.metric.startsWith("provider_earnings.")
      ? "insightsentry_calendar"
      : value.metric.startsWith("provider_fundamental.")
        ? "insightsentry_fundamentals"
        : value.metric.startsWith("provider_quote.")
          ? "insightsentry_quote"
          : undefined;
    if (
      !assignment.allowedRightsSources.some(
        (source) => source === value.source,
      ) ||
      (providerDataset !== undefined &&
        !allowedDatasets.has(providerDataset) &&
        !(
          providerDataset === "insightsentry_quote" &&
          allowedDatasets.has("market_bars")
        )) ||
      (counts.get(value.metric) ?? 0) >= 6
    )
      continue;
    counts.set(value.metric, (counts.get(value.metric) ?? 0) + 1);
    selected.push(value);
  }
  return selected.reverse();
}

export function specialistRequest(
  input: SpecialistRoundInput,
  assignment: SpecialistAssignmentV1,
  attempt: {
    readonly ordinal: number;
    readonly purpose: "mandatory_first" | "required_replacement";
  },
): SpecialistJobRequest {
  const role = workflowRoleById(assignment.roleId);
  if (role === undefined || role.id === "chair")
    throw new TypeError("specialist assignment role is unavailable");
  const identity = {
    runId: input.mandate.runId,
    roleId: role.id,
    ordinal: attempt.ordinal,
  };
  const claimSlots = allocateSpecialistClaimSlots(
    {
      runId: input.mandate.runId,
      snapshotId: input.snapshot.snapshotId,
      roleId: role.id,
    },
    input.mandate.researchProfile ?? DEFAULT_RESEARCH_PROFILE,
  );
  const researchProfile =
    input.mandate.researchProfile ?? DEFAULT_RESEARCH_PROFILE;
  return {
    promptName: `specialist_memo_prompt_v1:${role.id}`,
    schemaName: `specialist_memo_v1:${role.id}`,
    snapshotId: input.snapshot.snapshotId,
    evidenceCutoffAt: input.snapshot.evidenceCutoffAt,
    role: {
      id: role.id,
      name: role.name,
      focusAreas: assignment.focusAreas,
      evidenceNeeds: role.evidenceNeeds,
      requiredOutputs: assignment.requiredOutputs,
      forbiddenOutputs: assignment.forbiddenOutputs,
    },
    mandate: {
      mandateHash: input.mandate.mandateHash,
      ...(input.mandate.question === undefined
        ? {}
        : { question: input.mandate.question }),
      scope: input.mandate.scope,
      locale: input.mandate.locale,
      limitations: input.mandate.limitations,
      researchProfile,
    },
    capabilityStatement: assignment.evidenceSlice.capabilities,
    evidenceSlice: assignment.evidenceSlice,
    registeredValues: registeredValuesFor(
      assignment,
      input.snapshot.valueRegistry.records,
    ),
    comparatorQualification: input.comparatorQualification ?? {
      status: "not_available",
      reason: "peer_evidence_absent",
    },
    attempt: {
      jobId: JobIdSchema.parse(deterministicUuid({ ...identity, kind: "job" })),
      attemptId: AttemptIdSchema.parse(
        deterministicUuid({ ...identity, kind: "attempt" }),
      ),
      ordinal: attempt.ordinal,
      purpose: attempt.purpose,
    },
    claimSlots,
    ids: {
      claimId: claimSlots[0]!.claimId,
      questionId: QuestionIdSchema.parse(
        deterministicUuid({ ...identity, kind: "question" }),
      ),
    },
  };
}

type ClaimSubmissionRequest = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly roleId: SpecialistRoleId;
  readonly claimSlots: readonly SpecialistClaimSlot[];
  readonly allowedArtifactIds: readonly string[];
  readonly allowedMetricIds: readonly string[];
  readonly registeredValues?: readonly {
    readonly valueId: string;
    readonly metric: string;
    readonly value: string;
    readonly unit: string;
    readonly period: string;
  }[];
  readonly evidenceArtifacts?: readonly {
    readonly evidenceId: string;
    readonly dataset: string;
    readonly form?: string;
  }[];
  readonly validateEvidence?: boolean;
  readonly existingDepartmentTheses?: readonly {
    readonly en: string;
    readonly ko: string;
  }[];
};

export type SpecialistClaimValidationReason =
  | "specialist_claim_malformed"
  | "specialist_claim_slot_unallocated"
  | "specialist_claim_dimension_out_of_role"
  | "specialist_claim_role_owner_mismatch"
  | "specialist_claim_too_many_decisive_metrics"
  | "specialist_claim_unknown_metric"
  | "specialist_claim_unknown_evidence"
  | "specialist_claim_numeric_metric_mismatch"
  | "specialist_claim_evidence_type_mismatch"
  | "specialist_claim_duplicate_thesis"
  | "specialist_claim_required_slot_unused";

const PERCENTAGE_TOKEN = /-?\d+(?:,\d{3})*(?:\.\d+)?\s*%/gu;
const OWNERSHIP_CLAIM =
  /\b(?:insider|officer|director|beneficial owner)\b|내부자|임원|이사|대주주|보유\s*지분/iu;

function isForwardThresholdPercentage(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = text.slice(Math.max(0, start - 72), start);
  const after = text.slice(end, Math.min(text.length, end + 56));
  return (
    /(?:\b(?:if|when|unless|whether|threshold|trigger|warning|watch|treat)\b|(?:fall|drop|decline|rise|move|remain|stay|hold)\s+(?:below|above|under|over)|다음\s*(?:분기|실적)|향후|만약|경우|여부|기준|임계|경고|확인할)/iu.test(
      before,
    ) ||
    /(?:\b(?:threshold|trigger|warning|next\s+quarter)\b|(?:아래|이하|미만|위|이상|초과|밑돌|넘어서).{0,28}(?:경우|조건|경고|하락|상승|유지|확인|판단|반전))/iu.test(
      after,
    )
  );
}

function percentageMetricFamilies(text: string): readonly RegExp[] {
  const families: RegExp[] = [];
  if (
    /(?:revenue|sales).{0,40}(?:growth|grew|increase|decrease)|(?:growth|grew|increase|decrease).{0,40}(?:revenue|sales)|매출.{0,40}(?:성장|증가|감소)|(?:성장|증가|감소).{0,40}매출/iu.test(
      text,
    )
  )
    families.push(/revenue.*growth|growth.*revenue|sales.*growth/iu);
  if (/margin|마진|이익률/iu.test(text)) families.push(/margin/iu);
  if (
    /(?:stock|share price|price).{0,40}(?:rose|fell|up|down|increase|decrease)|주가.{0,40}(?:상승|하락|증가|감소)/iu.test(
      text,
    )
  )
    families.push(/change|return|performance|price.*percent/iu);
  return families;
}

function percentageClaimMatchesRegisteredMetrics(input: {
  readonly text: string;
  readonly decisiveMetricIds: readonly string[];
  readonly registeredValues: NonNullable<
    ClaimSubmissionRequest["registeredValues"]
  >;
}): boolean {
  const families = percentageMetricFamilies(input.text);
  if (families.length === 0) return true;
  const percentages = [
    ...new Set(
      [...input.text.matchAll(PERCENTAGE_TOKEN)]
        .filter((match) => {
          const start = match.index ?? 0;
          return !isForwardThresholdPercentage(
            input.text,
            start,
            start + (match[0]?.length ?? 0),
          );
        })
        .map((match) =>
          Math.abs(Number((match[0] ?? "").replace(/[,%\s]/gu, ""))),
        ),
    ),
  ].filter(Number.isFinite);
  if (percentages.length === 0) return true;
  const selected = input.registeredValues.filter(
    (record) =>
      input.decisiveMetricIds.includes(record.valueId) &&
      families.some((family) =>
        family.test(`${record.valueId} ${record.metric}`),
      ),
  );
  return percentages.every((percentage) =>
    selected.some((record) => {
      const value = Math.abs(Number(record.value));
      if (!Number.isFinite(value)) return false;
      return (
        Math.abs(value - percentage) <= 0.2 ||
        (value <= 1 && Math.abs(value * 100 - percentage) <= 0.2)
      );
    }),
  );
}

function evidenceTypesSuitClaim(input: {
  readonly text: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly evidenceArtifacts: NonNullable<
    ClaimSubmissionRequest["evidenceArtifacts"]
  >;
}): boolean {
  if (OWNERSHIP_CLAIM.test(input.text)) return true;
  const cited = new Set(input.evidenceArtifactIds);
  return !input.evidenceArtifacts.some(
    (artifact) =>
      cited.has(artifact.evidenceId) &&
      artifact.form !== undefined &&
      /^(?:3|4|5)(?:\/A)?$/iu.test(artifact.form.trim()),
  );
}

/**
 * Metric references are presentation aids, not the evidence authority. A model
 * occasionally returns a readable metric label instead of the registered value
 * id. Keep the grounded claim and discard only those unregistered references;
 * artifact citations remain subject to the strict commit-time audit.
 */
export function sanitizeSpecialistDecisiveMetricIds(
  candidate: unknown,
  allowedMetricIds: readonly string[],
): unknown {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("positions" in candidate) ||
    !Array.isArray(candidate.positions)
  )
    return candidate;
  const allowed = new Set(allowedMetricIds);
  return {
    ...candidate,
    positions: candidate.positions.map((position) => {
      if (
        typeof position !== "object" ||
        position === null ||
        !("decisiveMetricIds" in position) ||
        !Array.isArray(position.decisiveMetricIds)
      )
        return position;
      return {
        ...position,
        decisiveMetricIds: position.decisiveMetricIds
          .filter(
            (metricId: unknown): metricId is string =>
              typeof metricId === "string" && allowed.has(metricId),
          )
          .slice(0, 3),
      };
    }),
  };
}

/**
 * Models sometimes append an ownership filing to every claim because it was
 * present in the evidence slice. Remove only that incidental citation when a
 * suitable non-ownership source remains; otherwise leave the claim untouched
 * so the strict validator can request a grounded replacement.
 */
export function sanitizeSpecialistEvidenceTypeBindings(
  candidate: unknown,
  evidenceArtifacts: NonNullable<ClaimSubmissionRequest["evidenceArtifacts"]>,
): unknown {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("positions" in candidate) ||
    !Array.isArray(candidate.positions)
  )
    return candidate;
  const ownershipArtifacts = new Set(
    evidenceArtifacts
      .filter(
        (artifact) =>
          artifact.form !== undefined &&
          /^(?:3|4|5)(?:\/A)?$/iu.test(artifact.form.trim()),
      )
      .map((artifact) => artifact.evidenceId),
  );
  return {
    ...candidate,
    positions: candidate.positions.map((position) => {
      if (
        typeof position !== "object" ||
        position === null ||
        !("publicSummary" in position) ||
        typeof position.publicSummary !== "object" ||
        position.publicSummary === null ||
        !("en" in position.publicSummary) ||
        !("ko" in position.publicSummary) ||
        typeof position.publicSummary.en !== "string" ||
        typeof position.publicSummary.ko !== "string" ||
        !("evidenceArtifactIds" in position) ||
        !Array.isArray(position.evidenceArtifactIds)
      )
        return position;
      const text = `${position.publicSummary.en}\n${position.publicSummary.ko}`;
      if (OWNERSHIP_CLAIM.test(text)) return position;
      const permitted = position.evidenceArtifactIds.filter(
        (artifactId: unknown): artifactId is string =>
          typeof artifactId === "string" && !ownershipArtifacts.has(artifactId),
      );
      if (permitted.length === 0) return position;
      return { ...position, evidenceArtifactIds: permitted };
    }),
  };
}

/**
 * Claim ids and ownership fields are preallocated workflow metadata, not model
 * analysis. Normalize a position back to its unique semantic slot when the
 * model makes a copy typo, and drop only surplus positions that do not belong
 * to any allocated slot. The strict validator still rejects missing required
 * slots and ambiguous bindings.
 */
export function normalizeSpecialistClaimSlotBindings(
  request: Pick<ClaimSubmissionRequest, "roleId" | "claimSlots">,
  candidate: unknown,
): unknown {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("positions" in candidate) ||
    !Array.isArray(candidate.positions)
  )
    return candidate;
  const allocatedById = new Map(
    request.claimSlots.map((slot) => [slot.claimId, slot]),
  );
  const usedSlots = new Set<string>();
  const positions: Record<string, unknown>[] = [];
  for (const raw of candidate.positions) {
    if (typeof raw !== "object" || raw === null) continue;
    const position = raw as Record<string, unknown> & {
      readonly claimId?: unknown;
      readonly decisionDimension?: unknown;
      readonly materiality?: unknown;
    };
    const claimedId =
      typeof position.claimId === "string" ? position.claimId : undefined;
    let slot =
      claimedId === undefined || usedSlots.has(claimedId)
        ? undefined
        : allocatedById.get(claimedId as SpecialistClaimSlot["claimId"]);
    if (slot === undefined) {
      const semanticMatches = request.claimSlots.filter(
        (candidateSlot) =>
          !usedSlots.has(candidateSlot.claimId) &&
          candidateSlot.decisionDimension === position.decisionDimension &&
          candidateSlot.materiality === position.materiality,
      );
      if (semanticMatches.length === 1) slot = semanticMatches[0];
    }
    if (slot === undefined) continue;
    usedSlots.add(slot.claimId);
    positions.push({
      ...position,
      claimId: slot.claimId,
      decisionDimension: slot.decisionDimension,
      roleOwner: request.roleId,
      materiality: slot.materiality,
    });
  }
  return { ...candidate, positions };
}

type ClaimSubmissionValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SpecialistClaimValidationReason };

export function normalizedSpecialistThesis(value: {
  readonly en: string;
  readonly ko: string;
}) {
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .toLocaleLowerCase("und")
      .replace(/\[[^\]]*\]|\([^)]*(?:source|citation|출처|인용)[^)]*\)/giu, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  return `${normalize(value.en)}|${normalize(value.ko)}`;
}

export function specialistThesisFingerprints(
  candidate: unknown,
): readonly string[] {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("positions" in candidate) ||
    !Array.isArray(candidate.positions)
  )
    return [];
  return candidate.positions.flatMap((position) => {
    if (
      typeof position !== "object" ||
      position === null ||
      !("publicSummary" in position) ||
      typeof position.publicSummary !== "object" ||
      position.publicSummary === null ||
      !("en" in position.publicSummary) ||
      !("ko" in position.publicSummary) ||
      typeof position.publicSummary.en !== "string" ||
      typeof position.publicSummary.ko !== "string"
    )
      return [];
    return [normalizedSpecialistThesis(position.publicSummary)];
  });
}

export function validateSpecialistClaimSubmission(
  request: ClaimSubmissionRequest,
  candidate: unknown,
): ClaimSubmissionValidation {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("positions" in candidate) ||
    !Array.isArray(candidate.positions) ||
    candidate.positions.length < 1
  )
    return { ok: false, reason: "specialist_claim_malformed" };
  const allocatedById = new Map(
    request.claimSlots.map((slot) => [slot.claimId, slot]),
  );
  const allowedDimensions = new Set(
    ROLE_CLAIM_BLUEPRINTS[request.roleId].map(
      (blueprint) => blueprint.decisionDimension,
    ),
  );
  const allowedArtifacts = new Set(request.allowedArtifactIds);
  const allowedMetrics = new Set(request.allowedMetricIds);
  const fingerprints = new Set(
    (request.existingDepartmentTheses ?? []).map(normalizedSpecialistThesis),
  );
  const usedSlots = new Set<string>();
  for (const raw of candidate.positions) {
    if (typeof raw !== "object" || raw === null)
      return { ok: false, reason: "specialist_claim_malformed" };
    const claim = raw as {
      readonly claimId?: unknown;
      readonly decisionDimension?: unknown;
      readonly roleOwner?: unknown;
      readonly materiality?: unknown;
      readonly decisiveMetricIds?: unknown;
      readonly evidenceArtifactIds?: unknown;
      readonly publicSummary?: unknown;
      readonly strongestContraryObservation?: unknown;
      readonly falsifier?: unknown;
    };
    if (typeof claim.claimId !== "string")
      return { ok: false, reason: "specialist_claim_malformed" };
    const slot = allocatedById.get(
      claim.claimId as SpecialistClaimSlot["claimId"],
    );
    if (slot === undefined || usedSlots.has(claim.claimId))
      return { ok: false, reason: "specialist_claim_slot_unallocated" };
    usedSlots.add(claim.claimId);
    if (
      typeof claim.decisionDimension !== "string" ||
      !allowedDimensions.has(
        claim.decisionDimension as z.infer<
          typeof EditorialDecisionDimensionSchema
        >,
      ) ||
      claim.decisionDimension !== slot.decisionDimension
    )
      return { ok: false, reason: "specialist_claim_dimension_out_of_role" };
    if (claim.roleOwner !== request.roleId)
      return { ok: false, reason: "specialist_claim_role_owner_mismatch" };
    if (claim.materiality !== slot.materiality)
      return { ok: false, reason: "specialist_claim_malformed" };
    if (!Array.isArray(claim.decisiveMetricIds))
      return { ok: false, reason: "specialist_claim_malformed" };
    if (claim.decisiveMetricIds.length > 3)
      return {
        ok: false,
        reason: "specialist_claim_too_many_decisive_metrics",
      };
    if (
      claim.decisiveMetricIds.some(
        (metricId) =>
          typeof metricId !== "string" || !allowedMetrics.has(metricId),
      )
    )
      return { ok: false, reason: "specialist_claim_unknown_metric" };
    if (
      request.validateEvidence !== false &&
      (!Array.isArray(claim.evidenceArtifactIds) ||
        claim.evidenceArtifactIds.length < 1 ||
        claim.evidenceArtifactIds.some(
          (artifactId) =>
            typeof artifactId !== "string" || !allowedArtifacts.has(artifactId),
        ))
    )
      return { ok: false, reason: "specialist_claim_unknown_evidence" };
    if (
      typeof claim.publicSummary !== "object" ||
      claim.publicSummary === null ||
      typeof (claim.publicSummary as Record<string, unknown>)["en"] !==
        "string" ||
      typeof (claim.publicSummary as Record<string, unknown>)["ko"] !==
        "string" ||
      typeof claim.strongestContraryObservation !== "object" ||
      claim.strongestContraryObservation === null ||
      !("en" in claim.strongestContraryObservation) ||
      !("ko" in claim.strongestContraryObservation) ||
      typeof claim.strongestContraryObservation.en !== "string" ||
      typeof claim.strongestContraryObservation.ko !== "string" ||
      typeof claim.falsifier !== "object" ||
      claim.falsifier === null ||
      !("en" in claim.falsifier) ||
      !("ko" in claim.falsifier) ||
      typeof claim.falsifier.en !== "string" ||
      typeof claim.falsifier.ko !== "string"
    )
      return { ok: false, reason: "specialist_claim_malformed" };
    const publicSummary = claim.publicSummary as {
      readonly en: string;
      readonly ko: string;
    };
    const publicText = `${publicSummary.en}\n${publicSummary.ko}`;
    if (
      request.registeredValues !== undefined &&
      !percentageClaimMatchesRegisteredMetrics({
        text: publicText,
        decisiveMetricIds: claim.decisiveMetricIds as readonly string[],
        registeredValues: request.registeredValues,
      })
    )
      return {
        ok: false,
        reason: "specialist_claim_numeric_metric_mismatch",
      };
    if (
      request.evidenceArtifacts !== undefined &&
      !evidenceTypesSuitClaim({
        text: publicText,
        evidenceArtifactIds: claim.evidenceArtifactIds as readonly string[],
        evidenceArtifacts: request.evidenceArtifacts,
      })
    )
      return {
        ok: false,
        reason: "specialist_claim_evidence_type_mismatch",
      };
    const fingerprint = normalizedSpecialistThesis(publicSummary);
    if (fingerprints.has(fingerprint))
      return { ok: false, reason: "specialist_claim_duplicate_thesis" };
    fingerprints.add(fingerprint);
  }
  if (
    request.claimSlots.some(
      (slot) => !slot.optional && !usedSlots.has(slot.claimId),
    )
  )
    return { ok: false, reason: "specialist_claim_required_slot_unused" };
  return { ok: true };
}

export type CandidateInspection =
  | {
      readonly kind: "accepted";
      readonly candidate: SpecialistMemoCandidate;
      readonly publicFingerprint: string;
    }
  | { readonly kind: "invalid" };

export function inspectSpecialistCandidate(
  request: SpecialistJobRequest,
  output: string,
  existingPublicFingerprints: ReadonlySet<string>,
): CandidateInspection {
  let decoded: unknown;
  try {
    decoded = JSON.parse(output);
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: "invalid" };
    throw error;
  }
  const parsed = SpecialistMemoCandidateSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.roleId !== request.role.id)
    return { kind: "invalid" };
  const candidate = parsed.data;
  const serialized = JSON.stringify(candidate);
  const hasMarketData = request.capabilityStatement.some(
    (capability) =>
      capability.key === "current_market_data" &&
      capability.state.availability === "available",
  );
  if (
    PRICE_MENTION.test(serialized) &&
    (!PRICE_ENABLED_ROLES.has(request.role.id) || !hasMarketData)
  )
    return { kind: "invalid" };
  const evidenceHashes = new Map(
    request.evidenceSlice.artifacts.map((artifact) => [
      artifact.evidenceId,
      artifact.normalizedHash ?? artifact.rawHash,
    ]),
  );
  const evidenceRefs = [
    ...candidate.claims.flatMap((claim) => claim.evidenceRefs),
    ...candidate.opposingEvidence.flatMap((item) => item.evidenceRefs),
  ];
  if (
    evidenceRefs.some(
      (reference) =>
        evidenceHashes.get(reference.evidenceId) !== reference.contentHash,
    )
  )
    return { kind: "invalid" };
  const registeredValueIds = new Set(
    request.registeredValues.map((value) => value.valueId),
  );
  if (
    candidate.claims.some((claim) =>
      claim.calculationValueIds.some((id) => !registeredValueIds.has(id)),
    ) ||
    candidate.followUpProposals.some(
      (proposal) => !request.role.evidenceNeeds.includes(proposal.evidenceNeed),
    )
  )
    return { kind: "invalid" };
  const publicFingerprint = hashCanonical(candidate.publicSummary);
  if (existingPublicFingerprints.has(publicFingerprint))
    return { kind: "invalid" };
  return { kind: "accepted", candidate, publicFingerprint };
}

export function validateSpecialistRoundInput(
  input: SpecialistRoundInput,
): readonly SpecialistAssignmentV1[] | undefined {
  if (
    input.snapshot.runId !== input.mandate.runId ||
    input.snapshot.snapshotId !== input.mandate.snapshotId ||
    input.snapshot.manifestHash !== input.mandate.manifestHash ||
    input.assignments.mandateHash !== input.mandate.mandateHash
  )
    return undefined;
  const assignments = input.assignments.assignments;
  if (assignments.length !== WORKFLOW_V1_SPECIALIST_IDS.length)
    return undefined;
  const roleIds = new Set<SpecialistRoleId>();
  for (const assignment of assignments) {
    const { sliceHash: _sliceHash, ...sliceBody } = assignment.evidenceSlice;
    if (
      roleIds.has(assignment.roleId) ||
      assignment.evidenceSlice.roleId !== assignment.roleId ||
      assignment.evidenceSlice.snapshotId !== input.snapshot.snapshotId ||
      assignment.evidenceSlice.manifestHash !== input.snapshot.manifestHash ||
      assignment.evidenceSlice.mandateHash !== input.mandate.mandateHash ||
      hashCanonical(sliceBody) !== assignment.evidenceSlice.sliceHash
    )
      return undefined;
    roleIds.add(assignment.roleId);
  }
  return assignments;
}
