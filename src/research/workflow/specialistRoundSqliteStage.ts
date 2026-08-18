import { randomUUID } from "node:crypto";
import { hashBytes } from "../domain/contractHelpers";
import { EventIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { analyticalResearchProfile } from "../domain/researchProfile";
import { workflowRoleById } from "../domain/roleRegistry";
import { TEAM_CORE_DATA } from "../domain/teamCoreData";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import { codexInputHash } from "../server/codex/codexRunner";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { qualifyComparatorsBeforeSynthesis } from "./preSynthesisComparatorQualification";
import type { SpecialistRoundInput } from "./specialistRound";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import {
  specialistRequest,
  validateSpecialistRoundInput,
} from "./specialistRoundInput";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";
import type {
  PersistedSpecialistJob,
  SpecialistSourceArtifact,
  SqliteSpecialistRoundOptions,
} from "./specialistRoundSqliteContracts";

type SqliteStore = ReturnType<typeof openSqliteStore>;

export function permittedSpecialistInlineArtifact(artifact: {
  readonly dataset: string;
}): boolean {
  return artifact.dataset !== "insightsentry_peers";
}

type StageContext = {
  readonly options: SqliteSpecialistRoundOptions;
  readonly store: SqliteStore;
  readonly commitStore: SqliteAgentOutputCommitStore;
  readonly authority: SpecialistRoundSqliteAuthority;
};

const MAX_INLINE_EVIDENCE_BYTES = 72_000;
const MAX_INLINE_SOURCE_CHARS = 12_000;
const SPECIALIST_PROMPT_HEADROOM_BYTES = 16 * 1_024;

export function specialistInlineEvidenceBudget(
  basePromptBytes: number,
): number {
  return Math.min(
    MAX_INLINE_EVIDENCE_BYTES,
    Math.max(
      0,
      CODEX_RUNTIME_POLICY.maxPromptBytes -
        SPECIALIST_PROMPT_HEADROOM_BYTES -
        basePromptBytes -
        1,
    ),
  );
}

function filingExcerpt(
  text: string,
  focusAreas: readonly string[],
  maxChars: number,
): string {
  const windows: string[] = [text.slice(0, 12_000)];
  const lowered = text.toLowerCase();
  const terms = [
    ...focusAreas.flatMap((area) => area.split("_")),
    "revenue",
    "risk",
    "competition",
    "cash flow",
  ];
  for (const term of [...new Set(terms)]) {
    const index = lowered.indexOf(term.toLowerCase());
    if (index < 0) continue;
    windows.push(text.slice(Math.max(0, index - 3_000), index + 9_000));
    if (windows.join("\n").length >= maxChars) break;
  }
  return windows.join("\n\n").slice(0, maxChars);
}

function inlineSource(
  source: SpecialistSourceArtifact,
  focusAreas: readonly string[],
  maxChars: number,
): string {
  const decoded = new TextDecoder().decode(source.bytes);
  try {
    const parsed = JSON.parse(decoded) as {
      readonly value?: {
        readonly text?: unknown;
        readonly selectedFacts?: unknown;
        readonly treasury?: unknown;
        readonly bls?: unknown;
      };
    };
    if (typeof parsed.value?.text === "string")
      return filingExcerpt(parsed.value.text, focusAreas, maxChars);
    if (parsed.value?.selectedFacts !== undefined)
      return "Use the registeredValues in the request for normalized financial evidence.";
    return JSON.stringify(parsed.value ?? parsed).slice(0, maxChars);
  } catch {
    return decoded.slice(0, maxChars);
  }
}

export function specialistJobSeed(
  job: PersistedSpecialistJob,
  createdAt: string,
) {
  return {
    jobId: job.jobId,
    kind: "research" as const,
    logicalKey: job.logicalArtifactId,
    inputHash: job.inputHash,
    inputManifestHash: job.inputManifestHash,
    createdAt,
  };
}

function event(type: string, occurredAt: string) {
  return {
    eventId: EventIdSchema.parse(randomUUID()),
    type,
    stateId: type,
    occurredAt,
  };
}

export async function persistSpecialistSources(
  context: StageContext,
  jobs: readonly PersistedSpecialistJob[],
  sources: readonly SpecialistSourceArtifact[],
  first: PersistedSpecialistJob,
): Promise<void> {
  for (const source of sources) {
    const descriptor = await context.options.cas.put({
      artifactId: source.artifactId,
      runId: first.runId,
      snapshotId: first.snapshotId,
      mediaType: source.mediaType,
      parentDigests: [],
      bytes: source.bytes,
    });
    context.store.saveArtifactMetadata({
      ...descriptor,
      contentHash: descriptor.digest,
      logicalKey: `evidence:${source.evidenceId}`,
      inputHash: descriptor.digest,
      createdAt: new Date().toISOString(),
      locator: source.locator,
    });
  }
  for (const job of jobs)
    for (const artifactId of job.sourceArtifactIds)
      context.commitStore.bindJobInputArtifact({
        jobId: job.jobId,
        artifactId,
      });
}

export async function stageSqliteSpecialistRound(
  context: StageContext,
  input: SpecialistRoundInput,
  sources: readonly SpecialistSourceArtifact[],
): Promise<void> {
  const jobs = prepareSpecialistJobs(input, sources);
  const first = jobs[0];
  if (first === undefined) throw new TypeError("specialist roster is empty");
  context.store.createRun({
    runId: first.runId,
    snapshotId: first.snapshotId,
    requestedAt: input.snapshot.requestedAt,
    initialJob: specialistJobSeed(first, input.snapshot.snapshotSealedAt),
    initialEvent: event("run_created", input.snapshot.requestedAt),
  });
  context.authority.sealSnapshot(
    first.snapshotId,
    input.snapshot.evidenceCutoffAt,
    input.snapshot.snapshotSealedAt,
  );
  context.store.transitionRun({
    runId: first.runId,
    fromStatus: "queued",
    toStatus: "running",
    nextJobs: jobs
      .slice(1)
      .map((job) => specialistJobSeed(job, input.snapshot.snapshotSealedAt)),
    event: event("specialist_jobs_staged", input.mandate.mandateSealedAt),
  });
  context.authority.persistJobs(jobs, input.mandate.mandateSealedAt);
  await persistSpecialistSources(context, jobs, sources, first);
}

export function prepareSpecialistJobs(
  input: SpecialistRoundInput,
  sources: readonly SpecialistSourceArtifact[],
): readonly PersistedSpecialistJob[] {
  const assignments = validateSpecialistRoundInput(input);
  if (assignments === undefined)
    throw new TypeError("specialist round input is not sealed");
  const sourceByEvidence = new Map(
    sources.map((source) => [source.evidenceId, source]),
  );
  for (const source of sources) {
    const manifest = input.snapshot.artifacts.find(
      (artifact) => artifact.evidenceId === source.evidenceId,
    );
    if (
      manifest === undefined ||
      hashBytes(source.bytes) !== (manifest.normalizedHash ?? manifest.rawHash)
    )
      throw new TypeError("source bytes do not match the sealed snapshot");
  }
  const qualifiedInput =
    input.comparatorQualification === undefined
      ? {
          ...input,
          comparatorQualification: qualifyComparatorsBeforeSynthesis(sources),
        }
      : input;
  return assignments.map((assignment, index) => {
    const request = specialistRequest(qualifiedInput, assignment, {
      ordinal: index + 1,
      purpose: "mandatory_first",
    });
    const role = workflowRoleById(assignment.roleId);
    if (role === undefined || role.departmentId === "chair")
      throw new TypeError("specialist team data contract is unavailable");
    const teamData = TEAM_CORE_DATA[role.departmentId];
    const sourceArtifactIds = assignment.evidenceSlice.artifacts.map(
      (artifact) => {
        const source = sourceByEvidence.get(artifact.evidenceId);
        if (source === undefined)
          throw new TypeError("sealed source artifact is missing");
        return source.artifactId;
      },
    );
    const promptSections = [
      JSON.stringify({ request, sourceArtifactIds }),
      "",
      "Permitted sealed evidence excerpts are inlined below. Native hosted web search may be used for public context; do not call any other tool or read files.",
      "For sourceArtifactIds and evidenceArtifactIds, copy only exact UUIDs from the top-level sourceArtifactIds allowlist. contentHash, rawHash, and normalizedHash values are integrity metadata, not citation IDs, and must never be cited or converted into UUIDs.",
      "Fill every required preallocated request.claimSlots item owned by this role. Each slot includes an analyticalAngle and must produce one decision-relevant atomic claim that directly answers that angle. Optional supporting slots may remain unused only when the evidence cannot support a distinct claim.",
      "For each filled slot, preserve its claimId and decisionDimension, set roleOwner to request.role.id, cite evidence, select no more than three decisive metric IDs, state the single strongest contrary observation, and give a claim-specific observable falsifier.",
      "Claims from the same role must not restate one another. Give each slot a different mechanism, metric combination, investor implication, and falsifier; do not split one sentence into several cosmetic claims.",
      `CUSTOM RESEARCH PROFILE ${JSON.stringify(analyticalResearchProfile(request.mandate.researchProfile))}`,
      "The explanationMode metadata is reserved for final reader-facing copy. It must not reduce evidence breadth, analytical rigor, disagreement, or falsification work in this specialist stage.",
      "Apply the custom profile to analysis, not merely wording. short emphasizes the next catalyst and timing; medium emphasizes the next two to four reporting periods; long emphasizes moat, reinvestment, and terminal economics. new_entry requires entry prerequisites and valuation tolerance; holding_review requires thesis health and hold-or-reassess triggers; position_sizing requires asymmetry, concentration risk, and add/reduce conditions; earnings requires the dated earnings calendar, available estimates, recent filing, and the metric most likely to move the thesis before versus after the release.",
      "When counterargumentIntensity is strong, spend material analytical weight on the strongest evidence-backed opposing case and identify what the consensus view may be missing. Do not manufacture symmetry when one side is better supported.",
      "When analysisDepth is core, prioritize the single decisive claim and only add a distinct supporting claim when it changes the decision. For standard, cover every required slot. For deep, fill every slot and connect the mechanism to a measurable investor implication.",
      request.mandate.researchProfile.comparisonSymbols.length === 0
        ? "Use the automatically qualified peer set only when request.comparatorQualification supports it. If it does not, do not create a claim, public summary, dissent, or unknown whose thesis is missing, malformed, corrupt, or unusable peer data. Analyze absolute price action, operating performance, and valuation instead; mention the unavailable comparison at most once and only inside a concrete investor checkpoint when the user's question explicitly requires relative performance."
        : `Prioritize these user-selected comparison symbols when the qualified comparator evidence supports them: ${request.mandate.researchProfile.comparisonSymbols.join(", ")}. The automatically qualified set may provide sector context, but never substitute an unqualified company for a requested comparator.`,
      ...(request.mandate.researchProfile.comparisonSymbols.length > 0
        ? [
            `This is a direct company-choice mandate. Compare the subject company with ${request.mandate.researchProfile.comparisonSymbols.join(", ")} inside this role's owned decision dimensions and state which company has the stronger evidence for the selected horizon and purpose. A tie is allowed only when one explicit observable condition would reverse the choice; generic balance language is not an answer.`,
          ]
        : []),
      "Connect the role's most material claim directly to the user's question, selected horizon, and decision purpose. End that claim with the concrete investor implication: what should be watched, what evidence justifies waiting, or what observable result would strengthen or weaken the case. Do not repeat the question verbatim.",
      "Use only exact request.registeredValues[].id values in decisiveMetricIds. If no registered value directly supports the claim, return decisiveMetricIds as an empty array.",
      `TEAM DATA CONTRACT ${JSON.stringify(teamData)}`,
      "Use the available team datasets and metrics in that contract as the team's decision board. Check all inlined evidence before deciding a contracted metric is absent; when it is absent, name the concrete observable trigger that would resolve the claim.",
      "Licensed news is an event input, not a summary assignment. State what changed, connect it to this role's owned metric or mechanism, and give the next observable confirmation. Never restate a headline as analysis.",
      "A material event may be routed to several departments. Stay inside this role's decision dimensions and do not reproduce another team's likely interpretation: market owns price, volume, and relative reaction; company owns demand, product, customer, and competition; financial owns revenue, margin, cash flow, estimates, and capital allocation; risk owns downside transmission and mitigants.",
      ...(["benchmark", "company_competition", "valuation"].includes(
        assignment.roleId,
      )
        ? [
            "Use request.comparatorQualification as the only permitted peer-comparison input. Never infer or recalculate a peer set or median from raw peer evidence.",
          ]
        : []),
      ...((["market", "risk", "risk_policy"] as const).includes(
        assignment.roleId as "market" | "risk" | "risk_policy",
      )
        ? [
            "Use the expanded BLS pack as a regime, not a data dump: distinguish headline versus core inflation, employment level and unemployment, wage pressure, and producer-price pressure. Explain the transmission into demand, margins, discount rates, or downside triggers.",
          ]
        : []),
      ...((
        [
          "market",
          "company",
          "company_product",
          "company_competition",
          "financial",
          "financial_quality",
          "risk",
          "risk_policy",
          "valuation",
        ] as const
      ).includes(
        assignment.roleId as
          | "market"
          | "company"
          | "company_product"
          | "company_competition"
          | "financial"
          | "financial_quality"
          | "risk"
          | "risk_policy"
          | "valuation",
      )
        ? [
            "For SEC ownership evidence, separate open-market insider purchases or sales from grants, exercises, tax withholding, and planned dispositions. Treat Schedule 13D/G as material beneficial-owner disclosure, not as a complete institutional-flow feed; focus on changes that alter incentives, concentration, or governance risk.",
          ]
        : []),
      `ROLE-OWNED DECISION DIMENSIONS ${JSON.stringify(request.claimSlots.map((slot) => slot.decisionDimension))}`,
      "Keep each claim publicSummary atomic and concise: one short thesis per locale.",
      "Make the position distinct to this specialist role. Do not repeat a generic growth-is-strong-but-uncertain template when the evidence supports a more specific demand, moat, margin, valuation, market, or risk judgment.",
      "Unknowns are not disclaimer storage. Return at most two unknowns and phrase each as the observable metric, threshold, filing line, or dated event that would resolve the uncertainty.",
      "Public text must state concrete real-world observations and verification conditions only.",
      "Return only JSON that matches the required output schema.",
    ];
    const basePrompt = promptSections.join("\n");
    let remainingEvidenceBytes = specialistInlineEvidenceBudget(
      Buffer.byteLength(basePrompt),
    );
    const inlineEvidence = assignment.evidenceSlice.artifacts
      .filter(permittedSpecialistInlineArtifact)
      .flatMap((artifact) => {
        const source = sourceByEvidence.get(artifact.evidenceId);
        if (source === undefined)
          throw new TypeError("sealed source artifact is missing");
        const prefix = [
          `EVIDENCE ${artifact.evidenceId}`,
          `CONTENT_HASH ${artifact.normalizedHash ?? artifact.rawHash}`,
        ].join("\n");
        const prefixBytes = Buffer.byteLength(prefix) + 1;
        if (remainingEvidenceBytes <= prefixBytes) return [];
        const availableChars = Math.min(
          MAX_INLINE_SOURCE_CHARS,
          Math.max(0, Math.floor((remainingEvidenceBytes - prefixBytes) / 3)),
        );
        const content = inlineSource(
          source,
          assignment.focusAreas,
          availableChars,
        );
        const block = [prefix, content].join("\n");
        const blockBytes = Buffer.byteLength(block);
        if (blockBytes > remainingEvidenceBytes) return [];
        remainingEvidenceBytes -= blockBytes;
        return [block];
      });
    const prompt = [...promptSections, ...inlineEvidence].join("\n");
    return {
      runId: RunIdSchema.parse(input.mandate.runId),
      snapshotId: SnapshotIdSchema.parse(input.snapshot.snapshotId),
      roleId: assignment.roleId,
      jobId: request.attempt.jobId,
      logicalArtifactId: `memo:${assignment.roleId}`,
      prompt,
      inputHash: codexInputHash({
        stage: "memo",
        prompt,
        outputSchema: SpecialistMemoOutputSchema,
      }),
      inputManifestHash: assignment.evidenceSlice.sliceHash,
      sourceArtifactIds,
      comparatorQualification: request.comparatorQualification,
    } satisfies PersistedSpecialistJob;
  });
}
