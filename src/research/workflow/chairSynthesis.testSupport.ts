import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { makePersistableStructuralInput } from "../application/structuralAuditPersistence.testSupport";
import { StructuralAuditArtifactEnvelopeSchema } from "../application/structuralAuditPersistenceContracts";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { canonicalJson, hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { sha256Value } from "../server/codex/codexArtifacts";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import type {
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import { CodexRunnerError } from "../server/codex/codexRunner";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import { createSqliteFollowupAndResponseRound } from "./followupAndResponseRound";
import { FollowupResponseCodexFake } from "./followupAndResponseRound.testSupport";
import { createSqliteSemanticAudit } from "./semanticAudit";
import { persistStructuralAudit } from "./structuralAuditPersistence";
import { authenticatedWorkflowRetentionRegister } from "./structuralAuditWorkflowRegister";

export type ChairFault =
  | "none"
  | "invalid"
  | "invalid_first"
  | "crash_first"
  | "lost_first"
  | "uncertain_first"
  | "invent_price"
  | "invent_number"
  | "invent_claim"
  | "invent_source"
  | "invent_probability"
  | "invent_recommendation"
  | "drop_position"
  | "drop_dissent"
  | "drop_unknown"
  | "ko_mismatch"
  | "semantic_partial";

export class ChairCodexFake extends FollowupResponseCodexFake {
  chairLaunches = 0;
  constructor(private readonly fault: ChairFault) {
    super("none", { eligibleFollowups: 0 });
  }

  override async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    if (input.stage === "semantic_audit") {
      const prompt = z
        .object({
          claims: z.array(
            z.object({
              claimId: ClaimIdSchema,
              evidence: z.array(
                z.object({ evidenceKey: z.string() }).passthrough(),
              ),
            }),
          ),
          questions: z.array(z.object({ questionId: QuestionIdSchema })),
        })
        .passthrough()
        .parse(JSON.parse(input.prompt));
      return this.chairResult(input, {
        kind: "semantic_audit",
        verdicts: prompt.claims.map((claim) => ({
          claimId: claim.claimId,
          verdict: this.fault === "semantic_partial" ? "partial" : "entailed",
          contradictionSeverity:
            this.fault === "semantic_partial" ? "limited" : "none",
          publicExplanation: { en: "Entailed.", ko: "근거가 있습니다." },
        })),
        questionCoverage: prompt.questions.map((question) => ({
          questionId: question.questionId,
          status: "covered",
          claimIds: prompt.claims.map((claim) => claim.claimId),
        })),
      });
    }
    if (input.stage !== "chair_synthesis") return await super.run(input);
    this.chairLaunches += 1;
    if (this.fault === "crash_first" && this.chairLaunches === 1)
      throw new TypeError("simulated chair crash");
    if (this.fault === "lost_first" && this.chairLaunches === 1)
      throw new CodexRunnerError("timeout");
    if (this.fault === "uncertain_first" && this.chairLaunches === 1)
      throw new CodexRunnerError("process_failed");
    if (
      this.fault === "invalid" ||
      (this.fault === "invalid_first" && this.chairLaunches === 1)
    )
      return this.chairResult(input, {});
    const prompt = z
      .object({
        ballots: z.array(
          z
            .object({
              departmentId: z.string(),
              vote: z.string(),
            })
            .passthrough(),
        ),
        sentences: z.array(
          z.object({
            sentenceId: z.string(),
            kind: z.enum([
              "claim",
              "position",
              "ballot",
              "dissent",
              "unknown",
              "scenario",
              "change_condition",
            ]),
            text: z.object({ en: z.string(), ko: z.string() }),
          }),
        ),
      })
      .passthrough()
      .parse(JSON.parse(input.prompt));
    const firstLaunch = this.chairLaunches === 1;
    const idsFor = (key: (typeof CHAIR_SECTION_KEYS)[number]) => {
      const kinds =
        key === "ten_second_brief"
          ? ["claim"]
          : key === "supported_analysis"
            ? ["position", "ballot"]
            : key === "operational_scenarios"
              ? ["scenario"]
              : key === "dissent_unknowns"
                ? ["dissent", "unknown"]
                : ["change_condition"];
      return prompt.sentences
        .filter((sentence) => kinds.includes(sentence.kind))
        .map((sentence) => sentence.sentenceId);
    };
    const sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
      let sentenceIds = idsFor(sectionKey);
      if (
        this.fault === "drop_position" &&
        firstLaunch &&
        sectionKey === "supported_analysis"
      )
        sentenceIds = sentenceIds.filter((id) => id !== "position:market");
      const selected = sentenceIds.map((id) =>
        prompt.sentences.find((sentence) => sentence.sentenceId === id),
      );
      const text = {
        en: selected
          .flatMap((sentence) =>
            sentence === undefined ? [] : [sentence.text.en],
          )
          .join(" "),
        ko: selected
          .flatMap((sentence) =>
            sentence === undefined ? [] : [sentence.text.ko],
          )
          .join(" "),
      };
      if (firstLaunch && sectionKey === "ten_second_brief") {
        if (this.fault === "invent_price") text.en += " Target price 999.";
        if (this.fault === "invent_number") text.en += " Revenue is 777.";
        if (this.fault === "invent_probability")
          text.en += " Probability is 80%.";
        if (this.fault === "invent_recommendation") text.en += " Buy now.";
        if (this.fault === "ko_mismatch") text.ko += " 불일치";
      }
      return {
        sectionKey,
        publicSummary: text,
        sentenceIds,
      };
    });
    return this.chairResult(input, {
      kind: "chair_synthesis",
      sections,
    });
  }

  private chairResult<Candidate>(
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
          "6d8be49e49751554df16572369e636cbe02c84b208cad3dc35528c846eeca223",
        originDevice: "1",
        originInode: "1",
        linkDevice: "1",
        linkInode: "1",
        profileHash: "a".repeat(64),
        environmentHash: "b".repeat(64),
        argvHash: "c".repeat(64),
        schemaHash: "d".repeat(64),
        eventTypes: ["thread.started", "item.completed", "turn.completed"],
        exitCode: 0,
        toolEventCount: 0,
        cleanup: "complete",
      },
    };
  }
}

export async function createPreparedChairRound(fault: ChairFault) {
  const codex = new ChairCodexFake(fault);
  const root = mkdtempSync(join(tmpdir(), "chair-synthesis-"));
  const prepared = await stageAcceptedDepartments(root, "none", codex);
  const runId = RunIdSchema.parse(prepared.harness.input.mandate.runId);
  const challenges = createSqliteChallengeRound(prepared.options);
  await challenges.stage({
    runId,
    consolidationArtifactIds: prepared.departmentReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  const challengeReplay = await challenges.drain(runId);
  await challenges.close();
  const responses = createSqliteFollowupAndResponseRound(prepared.options);
  await responses.stage({
    runId,
    challengeArtifactIds: challengeReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  await responses.drain(runId);
  await responses.close();
  const retentionDatabase = new Database(prepared.options.databasePath, {
    readonly: true,
  });
  const workflowReferences = retentionDatabase
    .prepare(`SELECT artifacts.artifact_id,
      artifacts.logical_key, artifacts.content_hash
      FROM agent_output_commits
      JOIN artifacts USING(artifact_id)
      JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND (
        artifacts.logical_key LIKE 'memo:%' OR
        artifacts.logical_key LIKE 'consolidation:%' OR
        artifacts.logical_key LIKE 'challenge:%' OR
        artifacts.logical_key LIKE 'response_ballot:%'
      )`)
    .all(runId)
    .map((row) =>
      z
        .object({
          artifact_id: ArtifactIdSchema,
          logical_key: z.string(),
          content_hash: ArtifactDigestSchema,
        })
        .parse(row),
    )
    .map((row) => ({
      artifactId: row.artifact_id,
      logicalArtifactKey: row.logical_key,
      contentHash: row.content_hash,
    }));
  retentionDatabase.close();
  const retention = await authenticatedWorkflowRetentionRegister(
    prepared.harness.cas,
    workflowReferences,
    runId,
    prepared.harness.input.snapshot.snapshotId,
  );
  if (retention === undefined)
    throw new TypeError("workflow retention fixture is unauthenticated");
  const baseStructuralInput = makePersistableStructuralInput(prepared.harness);
  const structuralInput = {
    ...baseStructuralInput,
    retainedDissentClaimIds: retention.dissentClaimIds,
    retainedOpenQuestionIds: retention.openQuestions.map(
      (question) => question.questionId,
    ),
    retainedOpenQuestions: retention.openQuestions,
  };
  const structural = await persistStructuralAudit(
    { databasePath: prepared.options.databasePath, cas: prepared.harness.cas },
    {
      ...structuralInput,
      capabilities: [
        { key: "market_price", availability: "unavailable" as const },
      ],
    },
  );
  if (structural.kind !== "persisted") {
    const inspection = new Database(prepared.options.databasePath, {
      readonly: true,
    });
    const state = inspection
      .prepare(`SELECT runs.status, snapshots.state AS snapshot_state,
        (SELECT group_concat(logical_key || ':' || jobs.status || ':' ||
          COALESCE((SELECT attempts.outcome FROM attempts
            WHERE attempts.attempt_id = jobs.attempt_id), 'none'), '|') FROM jobs
          WHERE jobs.run_id = runs.run_id) AS jobs
        FROM runs JOIN snapshots USING(snapshot_id) WHERE runs.run_id = ?`)
      .get(runId);
    inspection.close();
    throw new TypeError(
      `structural fixture blocked: ${structural.reason}:${JSON.stringify(state)}`,
    );
  }
  const stored = await prepared.harness.cas.get(
    ArtifactDigestSchema.parse(structural.structuralAuditContentHash),
  );
  if (stored === undefined)
    throw new TypeError("structural fixture is missing");
  const envelope = StructuralAuditArtifactEnvelopeSchema.parse(
    JSON.parse(new TextDecoder().decode(stored.bytes)),
  );
  const { auditHash: _auditHash, ...structuralCore } = envelope.result;
  if (hashCanonical(structuralCore) !== envelope.result.auditHash)
    throw new TypeError(
      `structural fixture hash mismatch:${envelope.result.auditHash}:${hashCanonical(structuralCore)}`,
    );
  if (!envelope.publishable)
    throw new TypeError(
      `structural fixture is not publishable:${JSON.stringify(envelope.result.blockers)}`,
    );
  const semantic = createSqliteSemanticAudit(prepared.options);
  const semanticStage = await semantic.stage({
    runId,
    structuralAuditArtifactId: ArtifactIdSchema.parse(
      structural.structuralAuditArtifactId,
    ),
    questions: envelope.result.retainedOpenQuestionIds.map((id) =>
      QuestionIdSchema.parse(id),
    ),
  });
  const semanticReplay = await semantic.drain(runId);
  await semantic.close();
  if (!semanticReplay.publishable && fault !== "semantic_partial")
    throw new TypeError(
      `semantic fixture is not publishable:${JSON.stringify({ semanticStage, semanticReplay })}`,
    );
  return {
    root,
    runId,
    codex,
    options: prepared.options,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function exhaustChairReplacementBudget(
  databasePath: string,
  runId: string,
): void {
  const database = new Database(databasePath);
  database
    .prepare("UPDATE runs SET requested_replacement_calls = 0 WHERE run_id = ?")
    .run(runId);
  database.close();
}

export async function corruptAcceptedEnvelope(
  databasePath: string,
  cas: ArtifactCasPort,
  runId: string,
  logicalKey: string,
): Promise<void> {
  const database = new Database(databasePath);
  const row = z
    .object({
      artifact_id: ArtifactIdSchema,
      snapshot_id: SnapshotIdSchema,
      content_hash: ArtifactDigestSchema,
    })
    .parse(
      database
        .prepare(`SELECT artifact_id, snapshot_id, content_hash
    FROM artifacts WHERE run_id = ? AND logical_key = ?`)
        .get(runId, logicalKey),
    );
  const stored = await cas.get(row.content_hash);
  if (stored === undefined)
    throw new TypeError("accepted fixture artifact is missing");
  const envelope = z
    .object({ outputHash: z.string() })
    .passthrough()
    .parse(JSON.parse(new TextDecoder().decode(stored.bytes)));
  const bytes = new TextEncoder().encode(
    canonicalJson({ ...envelope, outputHash: "f".repeat(64) }),
  );
  const descriptor = await cas.put({
    artifactId: row.artifact_id,
    runId: RunIdSchema.parse(runId),
    snapshotId: row.snapshot_id,
    mediaType: stored.descriptor.mediaType,
    parentDigests: stored.descriptor.parentDigests,
    bytes,
  });
  database
    .prepare(
      "UPDATE artifacts SET content_hash = ?, byte_length = ? WHERE artifact_id = ?",
    )
    .run(descriptor.digest, descriptor.byteLength, row.artifact_id);
  database.close();
}

export function mixedClaimValidationFixture() {
  const claimA = ClaimIdSchema.parse("11111111-1111-4111-8111-111111111111");
  const claimB = ClaimIdSchema.parse("22222222-2222-4222-8222-222222222222");
  const ballotIds = WORKFLOW_V1_DEPARTMENT_IDS.map((_, index) =>
    ArtifactIdSchema.parse(
      `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
  );
  const sourceArtifactIds = [
    ArtifactIdSchema.parse("40000000-0000-4000-8000-000000000000"),
    ...ballotIds,
  ];
  const positions = WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId, index) => ({
    sentenceId: `position:${departmentId}`,
    kind: "position" as const,
    claimIds: [index === 0 ? claimA : claimB],
    sourceArtifactIds: [sourceArtifactIds[index + 1]],
    text: { en: `${departmentId} position`, ko: `${departmentId} 입장` },
  }));
  const ballots = WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId, index) => ({
    sentenceId: `ballot:${departmentId}`,
    kind: "ballot" as const,
    claimIds: [index === 0 ? claimA : claimB],
    sourceArtifactIds: [ballotIds[index]],
    text: { en: `${departmentId} ballot`, ko: `${departmentId} 표결` },
  }));
  const prompt = ChairSynthesisPromptSchema.parse({
    kind: "chair_synthesis_input_v1",
    mandate: {
      mandateHash: "a".repeat(64),
      scope: "broad",
      locale: "en",
      limitations: [],
    },
    capabilities: [{ key: "market_price", availability: "unavailable" }],
    auditedClaimIds: [claimA, claimB],
    departmentPositions: WORKFLOW_V1_DEPARTMENT_IDS.map(
      (departmentId, index) => ({
        departmentId,
        artifactId: sourceArtifactIds[index + 1],
      }),
    ),
    ballots: WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId, index) => ({
      departmentId,
      artifactId: ballotIds[index],
      vote: "support",
    })),
    dissentClaimIds: [claimB],
    unknownIds: ["55555555-5555-4555-8555-555555555555"],
    scenarioIds: ["scenario:revenue"],
    changeConditionClaimIds: [claimB],
    sourceArtifactIds,
    sentences: [
      {
        sentenceId: `claim:${claimA}`,
        kind: "claim",
        claimIds: [claimA],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Claim A", ko: "주장 A" },
      },
      ...positions,
      ...ballots,
      {
        sentenceId: `dissent:${claimB}`,
        kind: "dissent",
        claimIds: [claimB],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Dissent B", ko: "반대 B" },
      },
      {
        sentenceId: "unknown:55555555-5555-4555-8555-555555555555",
        kind: "unknown",
        claimIds: [],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Unknown", ko: "미확인" },
      },
      {
        sentenceId: "scenario:revenue",
        kind: "scenario",
        claimIds: [],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Revenue: 100", ko: "매출: 100" },
      },
      {
        sentenceId: `change_condition:${claimB}`,
        kind: "change_condition",
        claimIds: [claimB],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Change B", ko: "변경 B" },
      },
    ],
  });
  const kindsBySection: Readonly<
    Record<(typeof CHAIR_SECTION_KEYS)[number], readonly string[]>
  > = {
    ten_second_brief: ["claim"],
    supported_analysis: ["position", "ballot"],
    operational_scenarios: ["scenario"],
    dissent_unknowns: ["dissent", "unknown"],
    change_conditions: ["change_condition"],
  };
  const sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
    const selected = prompt.sentences.filter((sentence) =>
      kindsBySection[sectionKey].includes(sentence.kind),
    );
    return {
      sectionId: sectionKey,
      sectionKey,
      sentenceIds: selected.map((sentence) => sentence.sentenceId),
      auditedClaimIds: [
        ...new Set(selected.flatMap((sentence) => sentence.claimIds)),
      ],
      sourceArtifactIds: [
        ...new Set(selected.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
      publicSummary: {
        en: selected.map((sentence) => sentence.text.en).join(" "),
        ko: selected.map((sentence) => sentence.text.ko).join(" "),
      },
    };
  });
  const candidate = ChairSynthesisOutputSchema.parse({
    kind: "chair_synthesis",
    sourceArtifactIds,
    sections,
    ballotArtifactIds: ballotIds,
    dissentClaimIds: [claimB],
    unknowns: [{ en: "Unknown", ko: "미확인" }],
  });
  return { prompt, candidate, claimB };
}
