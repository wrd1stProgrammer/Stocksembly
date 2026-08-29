import { z } from "zod";
import { assignAllAgents } from "../application/assignAllAgents";
import {
  makeAssignmentHarness,
  requireAssignments,
} from "../application/createMandate.testSupport";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema } from "../domain/ids";
import { DEFAULT_RESEARCH_PROFILE } from "../domain/researchProfile";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { StrictArtifactCasFake } from "../ports/test/serviceFakes";
import { sha256Value } from "../server/codex/codexArtifacts";
import {
  CODEX_RUNTIME_PINS,
  CODEX_RUNTIME_POLICY,
  LINUX_CODEX_RUNTIME_PINS,
} from "../server/codex/codexPolicy";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import { CodexRunnerError } from "../server/codex/codexRunner";
import type { SpecialistRoundInput } from "./specialistRound";
import type { SpecialistSourceArtifact } from "./specialistRoundSqlite";

const id = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = (value: string): string => value.repeat(64);
const bytesByEvidence = new Map<string, string>([
  ["identity", "identity"],
  ["annual", "normalized-10-k"],
  ["annual-amendment", "10-k-amendment"],
  ["facts", "facts"],
  ["macro", "macro"],
]);

const PromptSchema = z.object({
  request: z
    .object({
      role: z.object({ id: z.enum(WORKFLOW_V1_SPECIALIST_IDS) }).passthrough(),
      ids: z.object({ claimId: z.string().uuid() }).passthrough(),
      claimSlots: z
        .array(
          z.object({
            claimId: z.string().uuid(),
            decisionDimension: z.string(),
            materiality: z.enum(["material", "supporting"]),
          }),
        )
        .min(1),
    })
    .passthrough(),
  sourceArtifactIds: z.array(z.string().uuid()).min(1),
});

export type CodexFailure =
  | "none"
  | "once"
  | "always"
  | "citation_once"
  | "citation_always";

class FakeCodexPort implements CodexPort {
  readonly id = "isolated-codex-cli" as const;
  readonly kind = "real" as const;
  active = 0;
  maximumActive = 0;
  launches = 0;
  readonly prompts: string[] = [];
  readonly #attempts = new Map<string, number>();

  constructor(private readonly failure: CodexFailure) {}

  async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    const runtimePins =
      process.platform === "linux"
        ? LINUX_CODEX_RUNTIME_PINS
        : CODEX_RUNTIME_PINS;
    this.active += 1;
    this.launches += 1;
    this.prompts.push(input.prompt);
    this.maximumActive = Math.max(this.maximumActive, this.active);
    await Promise.resolve();
    const prompt = PromptSchema.parse(
      JSON.parse(input.prompt.split("\n", 1).join("")),
    );
    const roleId = prompt.request.role.id;
    const attempts = (this.#attempts.get(roleId) ?? 0) + 1;
    this.#attempts.set(roleId, attempts);
    if (
      roleId === "market_news" &&
      (this.failure === "always" || (this.failure === "once" && attempts === 1))
    ) {
      this.active -= 1;
      throw new CodexRunnerError("output_invalid");
    }
    const citeInvalidArtifact =
      roleId === "market_news" &&
      (this.failure === "citation_always" ||
        (this.failure === "citation_once" && attempts === 1));
    const citedArtifactIds = citeInvalidArtifact
      ? [id(999)]
      : prompt.sourceArtifactIds;
    const candidate = input.outputSchema.parse({
      kind: "memo",
      sourceArtifactIds: citedArtifactIds,
      positions: [
        {
          claimId: prompt.request.claimSlots[0]!.claimId,
          decisionDimension: prompt.request.claimSlots[0]!.decisionDimension,
          roleOwner: roleId,
          stance: "supports",
          materiality: "material",
          publicSummary: {
            en: `${roleId} durable finding`,
            ko: `${roleId} 지속 가능한 결과`,
          },
          evidenceArtifactIds: citedArtifactIds,
          decisiveMetricIds: [],
          strongestContraryObservation: {
            en: `${roleId} contrary observation`,
            ko: `${roleId} 반대 관찰`,
          },
          falsifier: {
            en: `${roleId} observable falsifier`,
            ko: `${roleId} 관찰 가능한 반증 조건`,
          },
        },
      ],
      dissent: [],
      unknowns: [],
    });
    this.active -= 1;
    return {
      candidate,
      evidence: {
        ordinal: input.reservation.key.ordinal,
        stage: "memo",
        model: CODEX_RUNTIME_POLICY.model,
        reasoning: CODEX_RUNTIME_POLICY.reasoningByStage.memo,
        browsingPolicy: CODEX_RUNTIME_POLICY.browsingByStage.memo,
        toolTranscriptHash: sha256Value([]),
        binaryVersion: runtimePins.version,
        binaryHash: runtimePins.originSha256,
        originDevice: "1",
        originInode: "1",
        linkDevice: "1",
        linkInode: "1",
        profileHash: hash("a"),
        environmentHash: hash("b"),
        argvHash: hash("c"),
        schemaHash: hashCanonical("memo-output-schema"),
        eventTypes: ["thread.started", "item.completed", "turn.completed"],
        exitCode: 0,
        toolEventCount: 0,
        cleanup: "complete",
      },
    };
  }
}

export async function makeSqliteRoundHarness(failure: CodexFailure) {
  const assignmentHarness = await makeAssignmentHarness({
    scope: "broad",
    researchProfile: {
      ...DEFAULT_RESEARCH_PROFILE,
      analysisDepth: "core",
    },
  });
  const assignments = requireAssignments(
    await assignAllAgents(
      assignmentHarness.input,
      assignmentHarness.repository,
    ),
  );
  const input: SpecialistRoundInput = {
    mandate: assignmentHarness.input.mandate,
    snapshot: assignmentHarness.snapshot,
    assignments,
  };
  const encoder = new TextEncoder();
  const sources = input.snapshot.artifacts.map((artifact, index) => {
    const text = bytesByEvidence.get(artifact.evidenceId);
    if (text === undefined) throw new TypeError("unknown evidence fixture");
    return {
      evidenceId: artifact.evidenceId,
      artifactId: ArtifactIdSchema.parse(id(500 + index)),
      bytes: encoder.encode(text),
      mediaType: "application/json",
      locator: {
        kind: "sec_filing",
        source: "sec_primary_filing",
        sourceUrl: "https://www.sec.gov/Archives/example.htm",
        accession: "0000000000-26-000001",
        form: "10-K",
        filedAt: "2026-01-20T00:00:00.000Z",
        acceptedAt: "2026-01-20T00:01:00.000Z",
        periodEnd: "2025-12-31",
        unit: "USD",
      },
    } satisfies SpecialistSourceArtifact;
  });
  const codex = new FakeCodexPort(failure);
  return { input, sources, cas: new StrictArtifactCasFake(), codex };
}
