import { CALL_BUDGET_POLICY } from "../domain/callBudget";
import { hashCanonical } from "../domain/contractHelpers";
import { RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type {
  AcceptedSpecialistMemo,
  SpecialistJobRequest,
  SpecialistReceipt,
  SpecialistRoundDependencies,
  SpecialistRoundInput,
  SpecialistRoundResult,
} from "./specialistRoundContracts";
import {
  inspectSpecialistCandidate,
  specialistRequest,
  validateSpecialistRoundInput,
} from "./specialistRoundInput";

export type {
  AcceptedSpecialistMemo,
  SpecialistCommitInput,
  SpecialistCommitPort,
  SpecialistJobRequest,
  SpecialistMemoCandidate,
  SpecialistProcessPort,
  SpecialistProcessResult,
  SpecialistPublicEvent,
  SpecialistPublicEventPort,
  SpecialistReceipt,
  SpecialistRoundDependencies,
  SpecialistRoundInput,
  SpecialistRoundResult,
} from "./specialistRoundContracts";
export { SpecialistMemoCandidateSchema } from "./specialistRoundContracts";

const MAX_CONCURRENCY = 3;

type AttemptResult = {
  readonly receipt: SpecialistReceipt;
  readonly accepted?: AcceptedSpecialistMemo;
};

type AttemptContext = {
  readonly input: SpecialistRoundInput;
  readonly dependencies: SpecialistRoundDependencies;
  readonly publicFingerprints: Set<string>;
};

function receiptFor(
  request: SpecialistJobRequest,
  outcome: SpecialistReceipt["outcome"],
  outputHash?: string,
): SpecialistReceipt {
  const body = {
    roleId: request.role.id,
    ordinal: request.attempt.ordinal,
    attemptId: request.attempt.attemptId,
    outcome,
    ...(outputHash === undefined ? {} : { outputHash }),
  };
  return { ...body, receiptHash: hashCanonical(body) };
}

function processFailureReceipt(
  request: SpecialistJobRequest,
  kind: "crashed" | "timed_out" | "lost" | "uncertain",
): SpecialistReceipt {
  switch (kind) {
    case "crashed":
    case "timed_out":
    case "lost":
    case "uncertain":
      return receiptFor(request, kind);
  }
}

async function inBatches<Input, Output>(
  inputs: readonly Input[],
  operation: (input: Input) => Promise<Output>,
): Promise<readonly Output[]> {
  const output: Output[] = [];
  for (let index = 0; index < inputs.length; index += MAX_CONCURRENCY) {
    const batch = inputs.slice(index, index + MAX_CONCURRENCY);
    output.push(...(await Promise.all(batch.map(operation))));
  }
  return output;
}

async function runAttempt(
  context: AttemptContext,
  request: SpecialistJobRequest,
): Promise<AttemptResult> {
  const processResult = await context.dependencies.runner.run(request);
  if (processResult.kind !== "succeeded")
    return { receipt: processFailureReceipt(request, processResult.kind) };
  const outputHash = hashCanonical(processResult.output);
  const inspected = inspectSpecialistCandidate(
    request,
    processResult.output,
    context.publicFingerprints,
  );
  if (inspected.kind === "invalid")
    return { receipt: receiptFor(request, "invalid", outputHash) };
  context.publicFingerprints.add(inspected.publicFingerprint);
  const candidateHash = hashCanonical(inspected.candidate);
  const receipt = receiptFor(request, "accepted", candidateHash);
  const committed = await context.dependencies.committer.commit({
    runId: RunIdSchema.parse(context.input.mandate.runId),
    snapshotId: SnapshotIdSchema.parse(context.input.snapshot.snapshotId),
    roleId: request.role.id,
    candidate: inspected.candidate,
    candidateHash,
    receiptHash: receipt.receiptHash,
    request,
  });
  if (
    committed.kind !== "committed" ||
    committed.receiptHash !== receipt.receiptHash
  ) {
    context.publicFingerprints.delete(inspected.publicFingerprint);
    return { receipt: receiptFor(request, "lost", candidateHash) };
  }
  return {
    receipt,
    accepted: {
      roleId: request.role.id,
      artifactHash: committed.artifactHash,
      candidate: inspected.candidate,
    },
  };
}

function incompleteResult(
  acceptedMemos: readonly AcceptedSpecialistMemo[],
  receipts: readonly SpecialistReceipt[],
): SpecialistRoundResult {
  const acceptedIds = new Set(acceptedMemos.map((memo) => memo.roleId));
  return {
    kind: "incomplete",
    departmentStartAllowed: false,
    acceptedMemos,
    receipts,
    missingRoleIds: WORKFLOW_V1_SPECIALIST_IDS.filter(
      (roleId) => !acceptedIds.has(roleId),
    ),
  };
}

export async function runSpecialistRound(
  input: SpecialistRoundInput,
  dependencies: SpecialistRoundDependencies,
): Promise<SpecialistRoundResult> {
  const assignments = validateSpecialistRoundInput(input);
  if (assignments === undefined) return incompleteResult([], []);
  const publicFingerprints = new Set<string>();
  const mandatoryRequests = assignments.map((assignment, index) =>
    specialistRequest(input, assignment, {
      ordinal: index + 1,
      purpose: "mandatory_first",
    }),
  );
  const context = { input, dependencies, publicFingerprints };
  const mandatoryResults = await inBatches(mandatoryRequests, (request) =>
    runAttempt(context, request),
  );
  const acceptedByRole = new Map(
    mandatoryResults.flatMap((result) =>
      result.accepted === undefined
        ? []
        : [[result.accepted.roleId, result.accepted] as const],
    ),
  );
  const failedAssignments = assignments.filter(
    (assignment) => !acceptedByRole.has(assignment.roleId),
  );
  const replacements = failedAssignments
    .slice(0, CALL_BUDGET_POLICY.maxRequiredReplacements)
    .map((assignment, index) =>
      specialistRequest(input, assignment, {
        ordinal: mandatoryRequests.length + index + 1,
        purpose: "required_replacement",
      }),
    );
  const replacementResults = await inBatches(replacements, (request) =>
    runAttempt(context, request),
  );
  for (const result of replacementResults)
    if (result.accepted !== undefined)
      acceptedByRole.set(result.accepted.roleId, result.accepted);
  const acceptedMemos = WORKFLOW_V1_SPECIALIST_IDS.flatMap((roleId) => {
    const accepted = acceptedByRole.get(roleId);
    return accepted === undefined ? [] : [accepted];
  });
  const receipts = [...mandatoryResults, ...replacementResults].map(
    (result) => result.receipt,
  );
  if (acceptedMemos.length !== WORKFLOW_V1_SPECIALIST_IDS.length)
    return incompleteResult(acceptedMemos, receipts);
  if (
    new Set(acceptedMemos.map((memo) => memo.artifactHash)).size !==
    acceptedMemos.length
  )
    return incompleteResult(acceptedMemos, receipts);
  for (const memo of acceptedMemos)
    await dependencies.publicEvents.append({
      kind: "specialist_memo_committed",
      roleId: memo.roleId,
      artifactHash: memo.artifactHash,
      publicSummary: memo.candidate.publicSummary,
    });
  return {
    kind: "complete",
    departmentStartAllowed: true,
    acceptedMemos,
    receipts,
    missingRoleIds: [],
  };
}
