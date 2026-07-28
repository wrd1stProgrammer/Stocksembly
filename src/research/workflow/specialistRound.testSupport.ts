import { assignAllAgents } from "../application/assignAllAgents";
import {
  makeAssignmentHarness,
  requireAssignments,
} from "../application/createMandate.testSupport";
import type {
  SpecialistJobRequest,
  SpecialistMemoCandidate,
  SpecialistProcessResult,
  SpecialistRoundDependencies,
  SpecialistRoundInput,
} from "./specialistRound";

export const publicText = (roleId: string) => ({
  en: `${roleId} public finding`,
  ko: `${roleId} 공개 결과`,
});

export function candidateFor(
  request: SpecialistJobRequest,
): SpecialistMemoCandidate {
  const evidence = request.evidenceSlice.artifacts[0];
  const evidenceNeed = request.role.evidenceNeeds[0];
  if (evidence === undefined || evidenceNeed === undefined)
    throw new TypeError("role fixture needs evidence");
  return {
    kind: "specialist_memo_v1",
    roleId: request.role.id,
    publicSummary: publicText(request.role.id),
    claims: [
      {
        claimId: request.ids.claimId,
        stance: "supports",
        publicSummary: publicText(request.role.id),
        evidenceRefs: [
          {
            evidenceId: evidence.evidenceId,
            contentHash: evidence.normalizedHash ?? evidence.rawHash,
          },
        ],
        calculationValueIds: request.registeredValues.map(
          (value) => value.valueId,
        ),
        uncertainty: publicText(request.role.id),
        changeCondition: publicText(request.role.id),
      },
    ],
    opposingEvidence: [],
    unknowns: [publicText(request.role.id)],
    followUpProposals: [
      {
        questionId: request.ids.questionId,
        publicQuestion: publicText(request.role.id),
        evidenceNeed,
      },
    ],
  };
}

export const SPECIALIST_FAULTS = [
  "copied_role",
  "cross_slice",
  "timeout",
  "invalid_json",
  "price_mention",
] as const;
export type SpecialistFault = (typeof SPECIALIST_FAULTS)[number];

function faultOutput(
  fault: SpecialistFault,
  request: SpecialistJobRequest,
  marketRequest: SpecialistJobRequest | undefined,
): SpecialistProcessResult {
  const valid = candidateFor(request);
  switch (fault) {
    case "copied_role":
      return {
        kind: "succeeded",
        output: JSON.stringify({
          ...valid,
          publicSummary: publicText("market"),
        }),
      };
    case "cross_slice": {
      const marketEvidence = marketRequest?.evidenceSlice.artifacts[0];
      const firstClaim = valid.claims[0];
      if (marketEvidence === undefined || firstClaim === undefined)
        throw new TypeError("cross-slice fixture needs market evidence");
      return {
        kind: "succeeded",
        output: JSON.stringify({
          ...valid,
          claims: [
            {
              ...firstClaim,
              evidenceRefs: [
                {
                  evidenceId: marketEvidence.evidenceId,
                  contentHash:
                    marketEvidence.normalizedHash ?? marketEvidence.rawHash,
                },
              ],
            },
          ],
        }),
      };
    }
    case "timeout":
      return { kind: "timed_out" };
    case "invalid_json":
      return { kind: "succeeded", output: "{" };
    case "price_mention":
      return {
        kind: "succeeded",
        output: JSON.stringify({
          ...valid,
          publicSummary: {
            en: "Current price is $10",
            ko: "현재 주가는 10달러",
          },
        }),
      };
  }
}

export async function makeRoundFaultHarness(
  fault: SpecialistFault,
  failReplacement = false,
): Promise<{
  readonly input: SpecialistRoundInput;
  readonly dependencies: SpecialistRoundDependencies;
  readonly requests: SpecialistJobRequest[];
  readonly lifecycle: string[];
}> {
  const harness = await makeAssignmentHarness({ scope: "broad" });
  const assignments = requireAssignments(
    await assignAllAgents(harness.input, harness.repository),
  );
  const requests: SpecialistJobRequest[] = [];
  const lifecycle: string[] = [];
  let marketRequest: SpecialistJobRequest | undefined;
  return {
    input: {
      mandate: harness.input.mandate,
      snapshot: harness.snapshot,
      assignments,
    },
    dependencies: {
      runner: {
        run: async (request) => {
          requests.push(request);
          if (request.role.id === "market") marketRequest = request;
          if (
            request.role.id === "market_news" &&
            (request.attempt.purpose === "mandatory_first" || failReplacement)
          )
            return faultOutput(fault, request, marketRequest);
          return {
            kind: "succeeded",
            output: JSON.stringify(candidateFor(request)),
          };
        },
      },
      committer: {
        commit: async (input) => {
          lifecycle.push(`commit:${input.roleId}`);
          return {
            kind: "committed",
            artifactHash: input.candidateHash,
            receiptHash: input.receiptHash,
          };
        },
      },
      publicEvents: {
        append: async (event) => {
          lifecycle.push(`event:${event.roleId}`);
        },
      },
    },
    requests,
    lifecycle,
  };
}
