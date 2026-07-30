import { z } from "zod";
import { hashCanonical } from "../domain/contractHelpers";
import { RunIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { sha256Value } from "../server/codex/codexArtifacts";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import {
  type ChallengeFault,
  challengeSourceSummary,
  sourceFaultUsesValidDecision,
  sourcePositionStance,
} from "./challengeRoundBlindness.testSupport";
import type { ChallengeJobPrompt } from "./challengeRoundContracts";
import { ChallengeJobPromptSchema } from "./challengeRoundContracts";
import { createSqliteDepartmentRound } from "./departmentRound";
import {
  departmentCandidate,
  specialistCandidate,
} from "./departmentRoundCandidates.testSupport";
import { DepartmentJobPromptSchema } from "./departmentRoundContracts";
import { createSqliteSpecialistRound } from "./specialistRoundSqlite";
import { makeSqliteRoundHarness } from "./specialistRoundSqlite.testSupport";

export type { ChallengeFault } from "./challengeRoundBlindness.testSupport";

const SpecialistPromptSchema = z.object({
  request: z
    .object({
      role: z.object({ id: z.enum(WORKFLOW_V1_SPECIALIST_IDS) }).passthrough(),
    })
    .passthrough(),
  sourceArtifactIds: z.array(z.string().uuid()).min(1),
});

const DEPARTMENT_LEADS = new Set(["market", "company", "financial", "risk"]);

function evidenceFor<Candidate>(
  input: CodexRunInput<Candidate>,
): CodexRunResult<Candidate>["evidence"] {
  return {
    ordinal: input.reservation.key.ordinal,
    stage: input.stage,
    model: CODEX_RUNTIME_POLICY.model,
    reasoning: CODEX_RUNTIME_POLICY.reasoningByStage[input.stage],
    browsingPolicy: CODEX_RUNTIME_POLICY.browsingByStage[input.stage],
    toolTranscriptHash: sha256Value([]),
    binaryVersion: "codex-cli 0.146.0-alpha.3.1",
    binaryHash:
      "fb2b6b35789e59c885cf4d2aee12475809dd67b2c10df580e638122fd6b3438e",
    originDevice: "1",
    originInode: "1",
    linkDevice: "1",
    linkInode: "1",
    profileHash: "a".repeat(64),
    environmentHash: "b".repeat(64),
    argvHash: "c".repeat(64),
    schemaHash: hashCanonical(`${input.stage}-schema`),
    eventTypes: ["thread.started", "item.completed", "turn.completed"],
    exitCode: 0,
    toolEventCount: 0,
    cleanup: "complete",
  };
}

function challengeCandidate(
  request: ChallengeJobPrompt,
  fault: ChallengeFault,
) {
  const candidate = {
    kind: "blind_challenge",
    sourceArtifactIds: request.sourceArtifactIds,
    challengedClaimIds: [request.target.claimId],
    evidenceArtifactIds: [
      request.target.candidateCounterevidenceArtifactIds[0],
    ],
    contradiction: "partial",
    materiality: request.target.materiality,
    followupRequest: {
      targetClaimId: request.target.claimId,
      kind: "source_scope_clarification",
      evidenceArtifactIds: [
        request.target.candidateCounterevidenceArtifactIds[0],
      ],
    },
  };
  if (
    fault === "none" ||
    fault === "support_only" ||
    sourceFaultUsesValidDecision(fault) ||
    request.assignment.challengerId !== "market"
  )
    return candidate;
  if (fault === "unknown_claim")
    return {
      ...candidate,
      challengedClaimIds: ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"],
    };
  if (fault === "new_evidence")
    return {
      ...candidate,
      evidenceArtifactIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
    };
  if (fault === "qualitative_new_fact")
    return {
      ...candidate,
      publicChallenge: {
        en: "Customer switching costs remain durable",
        ko: "고객 전환 비용은 계속 견고하다",
      },
    };
  if (fault === "new_url")
    return {
      ...candidate,
      publicChallenge: {
        en: "See https://attacker.invalid for another assertion",
        ko: "외부 주소에서 다른 주장을 확인하라",
      },
    };
  if (fault === "omitted_parent")
    return {
      ...candidate,
      sourceArtifactIds: candidate.sourceArtifactIds.slice(0, -1),
    };
  if (fault === "impersonated_role")
    return { ...candidate, roleId: "financial" };
  if (fault === "recursive_task")
    return { ...candidate, recursiveTask: { kind: "blind_challenge" } };
  return {
    ...candidate,
    followupRequest: {
      ...candidate.followupRequest,
      kind: "arbitrary_browsing",
    },
  };
}

export class ChallengeCodexFake implements CodexPort {
  readonly id = "isolated-codex-cli" as const;
  readonly kind = "real" as const;
  readonly challengeInputs: ChallengeJobPrompt[] = [];
  readonly challengeOutputs: unknown[] = [];
  active = 0;
  maximumActive = 0;
  challengeLaunches = 0;

  constructor(private readonly fault: ChallengeFault) {}

  async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    await Promise.resolve();
    let rawCandidate: unknown;
    if (input.stage === "department_consolidation") {
      const request = DepartmentJobPromptSchema.parse(JSON.parse(input.prompt));
      const department = departmentCandidate(request, "none");
      rawCandidate =
        this.fault === "support_only" && request.department.id === "financial"
          ? { ...department, weakestClaimIds: department.strongestClaimIds }
          : department;
    } else if (input.stage === "blind_challenge") {
      const request = ChallengeJobPromptSchema.parse(JSON.parse(input.prompt));
      this.challengeInputs.push(request);
      this.challengeLaunches += 1;
      rawCandidate = challengeCandidate(request, this.fault);
      this.challengeOutputs.push(rawCandidate);
    } else {
      const prompt = SpecialistPromptSchema.parse(
        JSON.parse(input.prompt.split("\n", 1)[0] ?? ""),
      );
      const specialist = specialistCandidate(input.prompt, "none");
      const evidenceArtifactId = DEPARTMENT_LEADS.has(prompt.request.role.id)
        ? prompt.sourceArtifactIds[0]
        : prompt.sourceArtifactIds.at(-1);
      if (evidenceArtifactId === undefined)
        throw new TypeError("specialist evidence fixture is missing");
      const sourceSummary = challengeSourceSummary(
        this.fault,
        prompt.request.role.id,
      );
      rawCandidate = {
        ...specialist,
        positions: specialist.positions.map((position) => ({
          ...position,
          publicSummary: sourceSummary,
          stance: sourcePositionStance(this.fault, position.stance),
          evidenceArtifactIds: [evidenceArtifactId],
        })),
      };
    }
    const candidate = input.outputSchema.parse(rawCandidate);
    this.active -= 1;
    return { candidate, evidence: evidenceFor(input) };
  }
}

export function stageAcceptedDepartments(
  root: string,
  fault: ChallengeFault,
): Promise<
  Awaited<ReturnType<typeof stageAcceptedDepartmentsBase>> & {
    readonly codex: ChallengeCodexFake;
  }
>;
export function stageAcceptedDepartments<Codex extends CodexPort>(
  root: string,
  fault: ChallengeFault,
  providedCodex: Codex,
): Promise<
  Awaited<ReturnType<typeof stageAcceptedDepartmentsBase>> & {
    readonly codex: Codex;
  }
>;
export async function stageAcceptedDepartments(
  root: string,
  fault: ChallengeFault,
  providedCodex?: CodexPort,
) {
  return await stageAcceptedDepartmentsBase(root, fault, providedCodex);
}

async function stageAcceptedDepartmentsBase(
  root: string,
  fault: ChallengeFault,
  providedCodex?: CodexPort,
) {
  const harness = await makeSqliteRoundHarness("none");
  const codex = providedCodex ?? new ChallengeCodexFake(fault);
  const options = {
    databasePath: `${root}/research.sqlite`,
    attemptRoot: `${root}/attempts`,
    ownerId: "challenge-worker",
    cas: harness.cas,
    codex,
    now: () => "2026-07-23T00:00:00.000Z",
  };
  const specialists = createSqliteSpecialistRound(options);
  await specialists.stage(harness.input, harness.sources);
  await specialists.drain(harness.input.mandate.runId);
  await specialists.close();
  const departments = createSqliteDepartmentRound(options);
  await departments.stage({
    runId: RunIdSchema.parse(harness.input.mandate.runId),
    memberArtifactIds: departments
      .acceptedMemos(harness.input.mandate.runId)
      .map((memo) => memo.artifactId),
  });
  const departmentReplay = await departments.drain(harness.input.mandate.runId);
  await departments.close();
  return { harness, codex, options, departmentReplay };
}
