import { randomUUID } from "node:crypto";
import { MemoOutputSchema } from "../domain/agentOutputs";
import { hashBytes } from "../domain/contractHelpers";
import { EventIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { workflowRoleById } from "../domain/roleRegistry";
import { TEAM_CORE_DATA } from "../domain/teamCoreData";
import { codexInputHash } from "../server/codex/codexRunner";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import type { SpecialistRoundInput } from "./specialistRound";
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

type StageContext = {
  readonly options: SqliteSpecialistRoundOptions;
  readonly store: SqliteStore;
  readonly commitStore: SqliteAgentOutputCommitStore;
  readonly authority: SpecialistRoundSqliteAuthority;
};

const MAX_INLINE_EVIDENCE_BYTES = 72_000;
const MAX_INLINE_SOURCE_CHARS = 12_000;

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
  return assignments.map((assignment, index) => {
    const request = specialistRequest(input, assignment, {
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
    let remainingEvidenceBytes = MAX_INLINE_EVIDENCE_BYTES;
    const inlineEvidence = assignment.evidenceSlice.artifacts.map(
      (artifact) => {
        const source = sourceByEvidence.get(artifact.evidenceId);
        if (source === undefined)
          throw new TypeError("sealed source artifact is missing");
        const prefix = [
          `EVIDENCE ${artifact.evidenceId}`,
          `CONTENT_HASH ${artifact.normalizedHash ?? artifact.rawHash}`,
        ].join("\n");
        const availableChars = Math.min(
          MAX_INLINE_SOURCE_CHARS,
          Math.max(
            0,
            Math.floor(
              (remainingEvidenceBytes - Buffer.byteLength(prefix)) / 3,
            ),
          ),
        );
        const content = inlineSource(
          source,
          assignment.focusAreas,
          availableChars,
        );
        const block = [prefix, content].join("\n");
        remainingEvidenceBytes = Math.max(
          0,
          remainingEvidenceBytes - Buffer.byteLength(block),
        );
        return block;
      },
    );
    const prompt = [
      JSON.stringify({ request, sourceArtifactIds }),
      "",
      "All permitted sealed evidence is inlined below. Native hosted web search may be used for public context; do not call any other tool or read files.",
      "Answer the mandate question directly from your specialist role. Do not say that the claim or question was not supplied: the mandate.question field is the controlling research question.",
      "Lead with an investment-relevant judgment, then cite the strongest supporting and opposing evidence. Company identity or business-description facts are context, not a conclusion.",
      `TEAM DATA CONTRACT ${JSON.stringify(teamData)}`,
      "Use the available team datasets and metrics in that contract as the team's decision board. Do not claim a contracted metric is unavailable until you have checked all inlined evidence. If it is genuinely absent, name the observable trigger instead of writing a provider or scope disclaimer.",
      ...(assignment.roleId === "benchmark"
        ? [
            "When insightsentry_peers is available, distinguish filing-linked direct competitors from operating comparables. Compare named companies across 3-month and 1-year share performance, revenue growth, margins, market-cap scale, and available valuation multiples; explain dispersion instead of listing numbers.",
          ]
        : assignment.roleId === "company_competition"
          ? [
              "When insightsentry_peers is available, explain why each material peer belongs in the set and distinguish product-market rivalry from companies used only as operating or valuation comparables.",
            ]
          : assignment.roleId === "valuation"
            ? [
                "When insightsentry_peers is available, calculate available peer medians, state the subject company's premium or discount, and judge whether growth and margin differences justify it. Never reduce the conclusion to a bare cautious/supportive label.",
              ]
            : []),
      "Return exactly one positions item using request.ids.claimId. Combine the role's material findings into that single investment-relevant position.",
      "Keep publicSummary concise: at most two short sentences per locale. State what the evidence changes for the investment case and the most important uncertainty.",
      "Make the position distinct to this specialist role. Do not repeat a generic growth-is-strong-but-uncertain template when the evidence supports a more specific demand, moat, margin, valuation, market, or risk judgment.",
      "Unknowns are not disclaimer storage. Return at most two unknowns and phrase each as the observable metric, threshold, filing line, or dated event that would resolve the uncertainty.",
      "Do not mention that sealed, licensed, provider, consensus, recommendation, or scope data is missing in publicSummary or unknowns. If a dataset is unavailable, state the concrete real-world variable the investor should verify next.",
      "Return only JSON that matches the required output schema.",
      ...inlineEvidence,
    ].join("\n");
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
        outputSchema: MemoOutputSchema,
      }),
      inputManifestHash: assignment.evidenceSlice.sliceHash,
      sourceArtifactIds,
    } satisfies PersistedSpecialistJob;
  });
}
