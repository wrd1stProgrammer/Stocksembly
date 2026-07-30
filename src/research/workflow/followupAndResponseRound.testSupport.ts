import { OwnerResponseBallotOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import { sha256Value } from "../server/codex/codexArtifacts";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import {
  ChallengeCodexFake,
  type ChallengeFault,
} from "./challengeRound.testSupport";
import { ChallengeDecisionSchema } from "./challengeRoundContracts";
import {
  FollowupJobPromptSchema,
  OwnerResponseJobPromptSchema,
} from "./followupAndResponseRoundContracts";

export class FollowupResponseCodexFake implements CodexPort {
  readonly id = "isolated-codex-cli" as const;
  readonly kind = "real" as const;
  readonly #base: ChallengeCodexFake;
  followupLaunches = 0;
  responseLaunches = 0;
  ballotModelLaunches = 0;
  readonly responseInputs: ReturnType<
    typeof OwnerResponseJobPromptSchema.parse
  >[] = [];
  readonly responseOutputs: ReturnType<
    typeof OwnerResponseBallotOutputSchema.parse
  >[] = [];
  #challengeIndex = 0;

  constructor(
    fault: ChallengeFault,
    private readonly options: {
      readonly eligibleFollowups?: number;
      readonly invalidFollowup?: boolean;
      readonly invalidBallotDepartment?:
        | "market"
        | "company"
        | "financial"
        | "risk";
    } = {},
  ) {
    this.#base = new ChallengeCodexFake(fault);
  }

  async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    if (input.stage === "follow_up") {
      this.followupLaunches += 1;
      const request = FollowupJobPromptSchema.parse(JSON.parse(input.prompt));
      if (this.options.invalidFollowup === true) return this.result(input, {});
      return this.result(input, {
        kind: "follow_up",
        sourceArtifactIds: request.sourceArtifactIds,
        requestId: request.requestId,
        publicAnswer: { en: "Evidence checked.", ko: "증거를 확인했습니다." },
        evidenceArtifactIds: request.evidenceArtifactIds,
        unresolved: [],
      });
    }
    if (input.stage === "owner_response_ballot") {
      this.responseLaunches += 1;
      const request = OwnerResponseJobPromptSchema.parse(
        JSON.parse(input.prompt),
      );
      this.responseInputs.push(request);
      if (this.options.invalidBallotDepartment === request.departmentId)
        return this.result(input, {});
      const output = OwnerResponseBallotOutputSchema.parse({
        kind: "owner_response_ballot",
        sourceArtifactIds: request.sourceArtifactIds,
        dispositions: request.targetClaimIds.map((claimId) => ({
          claimId,
          disposition: "revise",
          publicRationale: {
            en: "Evidence narrows the claim.",
            ko: "증거가 주장을 좁힙니다.",
          },
        })),
        ballot: {
          vote: "support_with_reservations",
          rationaleClaimIds: request.targetClaimIds,
          publicRationale: {
            en: "Support with unresolved conditions.",
            ko: "미해결 조건부로 지지합니다.",
          },
        },
        dissent: [],
        unresolvedConditions: [
          {
            en: "One request was not selected.",
            ko: "요청 하나가 선택되지 않았습니다.",
          },
        ],
      });
      this.responseOutputs.push(output);
      return this.result(input, output);
    }
    const result = await this.#base.run(input);
    if (input.stage !== "blind_challenge") return result;
    const challenge = ChallengeDecisionSchema.parse(result.candidate);
    const index = this.#challengeIndex;
    this.#challengeIndex += 1;
    const eligible = this.options.eligibleFollowups ?? 4;
    return {
      ...result,
      candidate: input.outputSchema.parse(
        index < eligible ? challenge : { ...challenge, followupRequest: null },
      ),
    };
  }

  private result<Candidate>(
    input: CodexRunInput<Candidate>,
    raw: unknown,
  ): CodexRunResult<Candidate> {
    return {
      candidate: input.outputSchema.parse(raw),
      evidence: {
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
      },
    };
  }
}
