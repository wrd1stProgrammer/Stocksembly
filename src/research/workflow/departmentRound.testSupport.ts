import { hashCanonical } from "../domain/contractHelpers";
import { sha256Value } from "../server/codex/codexArtifacts";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import {
  type DepartmentFault,
  departmentCandidate,
  specialistCandidate,
} from "./departmentRoundCandidates.testSupport";
import type { DepartmentJobPrompt } from "./departmentRoundContracts";
import { DepartmentJobPromptSchema } from "./departmentRoundContracts";
import { createSqliteSpecialistRound } from "./specialistRoundSqlite";
import { makeSqliteRoundHarness } from "./specialistRoundSqlite.testSupport";

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

export class DepartmentCodexFake implements CodexPort {
  readonly id = "isolated-codex-cli" as const;
  readonly kind = "real" as const;
  readonly departmentInputs: DepartmentJobPrompt[] = [];
  readonly departmentOutputs: unknown[] = [];
  active = 0;
  maximumActive = 0;
  departmentLaunches = 0;

  constructor(private readonly fault: DepartmentFault) {}

  async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    await Promise.resolve();
    const rawCandidate =
      input.stage === "department_consolidation"
        ? this.departmentOutput(input.prompt)
        : specialistCandidate(input.prompt, this.fault);
    const candidate = input.outputSchema.parse(rawCandidate);
    this.active -= 1;
    return { candidate, evidence: evidenceFor(input) };
  }

  private departmentOutput(prompt: string): unknown {
    const request = DepartmentJobPromptSchema.parse(JSON.parse(prompt));
    this.departmentInputs.push(request);
    this.departmentLaunches += 1;
    const output = departmentCandidate(request, this.fault);
    this.departmentOutputs.push(output);
    return output;
  }
}

export async function stageAcceptedSpecialists(
  root: string,
  fault: DepartmentFault,
) {
  const harness = await makeSqliteRoundHarness("none");
  const codex = new DepartmentCodexFake(fault);
  const databasePath = `${root}/research.sqlite`;
  const options = {
    databasePath,
    attemptRoot: `${root}/attempts`,
    ownerId: "department-worker",
    cas: harness.cas,
    codex,
    now: () => "2026-07-23T00:00:00.000Z",
  };
  const round = createSqliteSpecialistRound(options);
  await round.stage(harness.input, harness.sources);
  const replay = await round.drain(harness.input.mandate.runId);
  await round.close();
  return { harness, codex, options, replay };
}
