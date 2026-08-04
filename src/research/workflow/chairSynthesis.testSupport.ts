import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { makePersistableStructuralInput } from "../application/structuralAuditPersistence.testSupport";
import { StructuralAuditArtifactEnvelopeSchema } from "../application/structuralAuditPersistenceContracts";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { createAtomicClaim } from "../domain/claims";
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
import { CodexIsolationError } from "../server/codex/readiness";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import { createSqliteFollowupAndResponseRound } from "./followupAndResponseRound";
import { FollowupResponseCodexFake } from "./followupAndResponseRound.testSupport";
import { createSqliteSemanticAudit } from "./semanticAudit";
import { specialistRequest } from "./specialistRoundInput";
import { persistStructuralAudit } from "./structuralAuditPersistence";
import { authenticatedWorkflowRetentionRegister } from "./structuralAuditWorkflowRegister";

export type ChairFault =
  | "none"
  | "invalid"
  | "invalid_first"
  | "crash_first"
  | "lost_first"
  | "uncertain_first"
  | "isolation_first"
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
    if (input.stage === "owner_response_ballot") {
      const result = await super.run(input);
      const ballot = z
        .object({
          dispositions: z.array(
            z.object({ claimId: z.string().uuid() }).passthrough(),
          ),
        })
        .passthrough()
        .parse(result.candidate);
      return {
        ...result,
        candidate: input.outputSchema.parse({
          ...ballot,
          dispositions: ballot.dispositions.map((disposition) => ({
            ...disposition,
            disposition: "accept",
          })),
        }),
      };
    }
    if (input.stage !== "chair_synthesis") return await super.run(input);
    this.chairLaunches += 1;
    if (this.fault === "isolation_first" && this.chairLaunches === 1)
      throw new CodexIsolationError("probe");
    const promptRecord = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(input.prompt));
    if (promptRecord["kind"] === "chair_section_rewrite_request") {
      const rewrite = z
        .object({
          target: z.object({ sectionKey: z.enum(CHAIR_SECTION_KEYS) }),
          requiredPrimaryAssignment: z.object({
            sectionKey: z.enum(CHAIR_SECTION_KEYS),
            primarySentenceId: z.string(),
            primaryClaimIds: z.array(z.string().uuid()),
          }),
          requiredConflictAdjudication: z
            .object({
              departmentDecisionSentenceIds: z.array(z.string()),
              reasonSentenceId: z.string(),
            })
            .nullable(),
          preserve: z
            .object({
              primarySentenceId: z.string(),
              sentenceIds: z.array(z.string()),
              conflictAdjudication: z.unknown(),
            })
            .optional(),
          sentences: z.array(
            z.object({
              sentenceId: z.string(),
              kind: z.string(),
              text: z.object({ en: z.string(), ko: z.string() }),
            }),
          ),
        })
        .passthrough()
        .parse(promptRecord);
      const sentenceIds =
        rewrite.preserve?.sentenceIds ??
        (rewrite.target.sectionKey === "supported_analysis" &&
        rewrite.requiredConflictAdjudication !== null
          ? rewrite.requiredConflictAdjudication.departmentDecisionSentenceIds
          : [rewrite.requiredPrimaryAssignment.primarySentenceId]);
      const selected = sentenceIds.flatMap((sentenceId) => {
        const sentence = rewrite.sentences.find(
          (item) => item.sentenceId === sentenceId,
        );
        return sentence === undefined ? [] : [sentence];
      });
      const primary = rewrite.sentences.find(
        (sentence) =>
          sentence.sentenceId ===
          (rewrite.preserve?.primarySentenceId ??
            rewrite.requiredPrimaryAssignment.primarySentenceId),
      );
      if (primary === undefined) return this.chairResult(input, {});
      if (this.fault === "invalid")
        return this.chairResult(input, {
          kind: "chair_section_rewrite",
          section: {
            sectionKey: rewrite.target.sectionKey,
            publicSummary: primary.text,
            primarySentenceId: "sentence:not-in-catalog",
            sentenceIds: ["sentence:not-in-catalog"],
            conflictAdjudication: null,
          },
        });
      return this.chairResult(input, {
        kind: "chair_section_rewrite",
        section: {
          sectionKey: rewrite.target.sectionKey,
          publicSummary: primary.text,
          primarySentenceId: primary.sentenceId,
          sentenceIds: selected.map((sentence) => sentence.sentenceId),
          conflictAdjudication:
            rewrite.preserve?.conflictAdjudication ??
            (rewrite.target.sectionKey === "supported_analysis" &&
            rewrite.requiredConflictAdjudication !== null
              ? {
                  departmentDecisionSentenceIds:
                    rewrite.requiredConflictAdjudication
                      .departmentDecisionSentenceIds,
                  resolution: "proof_required",
                  reasonSentenceId:
                    rewrite.requiredConflictAdjudication.reasonSentenceId,
                }
              : null),
        },
      });
    }
    const prompt = z
      .object({
        mandate: z.object({ locale: z.enum(["en", "ko"]) }).passthrough(),
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
            claimIds: z.array(z.string().uuid()),
            text: z.object({ en: z.string(), ko: z.string() }),
          }),
        ),
        unknownIds: z.array(z.string().uuid()),
        sectionPrimaryAssignments: z.array(
          z.object({
            sectionKey: z.enum(CHAIR_SECTION_KEYS),
            primarySentenceId: z.string(),
            primaryClaimIds: z.array(z.string().uuid()),
          }),
        ),
        directionalBriefContract: z.object({
          requiredStance: z.enum([
            "upside_skewed",
            "wait_for_proof",
            "downside_skewed",
          ]),
          requiredConfidence: z.enum(["high", "medium", "low"]),
          requiredPrimarySentenceIds: z.array(z.string()),
          requiredPrimaryClaimIds: z.array(z.string().uuid()),
          roles: z.object({
            decisive: z.object({
              assignedSentenceId: z.string(),
              canonicalText: z.object({ en: z.string(), ko: z.string() }),
            }).passthrough(),
            countercase: z.object({
              assignedSentenceId: z.string(),
              canonicalText: z.object({ en: z.string(), ko: z.string() }),
            }).passthrough(),
            falsifier: z.object({
              assignedSentenceId: z.string(),
              canonicalText: z.object({ en: z.string(), ko: z.string() }),
            }).passthrough(),
          }),
        }).passthrough(),
        teamConflictContract: z.object({
          detected: z.boolean(),
          requiredOwnedPositionSentenceIds: z.array(z.string()),
          requiredDepartmentDecisionSentenceIds: z.array(z.string()),
        }).passthrough(),
      })
      .passthrough()
      .parse(JSON.parse(input.prompt));
    const firstLaunch = this.chairLaunches === 1;
    const assignedIdsFor = (
      sectionKey: (typeof CHAIR_SECTION_KEYS)[number],
    ): readonly string[] => {
      const assignment = prompt.sectionPrimaryAssignments.find(
        (item) => item.sectionKey === sectionKey,
      );
      if (assignment === undefined)
        throw new TypeError("missing fixture primary assignment");
      return sectionKey === "supported_analysis" &&
        prompt.teamConflictContract.detected
        ? prompt.teamConflictContract.requiredOwnedPositionSentenceIds
        : [assignment.primarySentenceId];
    };
    const idsBySection: Record<
      (typeof CHAIR_SECTION_KEYS)[number],
      readonly string[]
    > = {
      ten_second_brief: assignedIdsFor("ten_second_brief"),
      supported_analysis: assignedIdsFor("supported_analysis"),
      valuation_comparison: assignedIdsFor("valuation_comparison"),
      operational_scenarios: assignedIdsFor("operational_scenarios"),
      dissent_unknowns: assignedIdsFor("dissent_unknowns"),
      change_conditions: assignedIdsFor("change_conditions"),
    };
    let sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
      let sentenceIds = [...idsBySection[sectionKey]];
      if (
        this.fault === "drop_position" &&
        firstLaunch &&
        sectionKey === "supported_analysis"
      )
        sentenceIds = sentenceIds.slice(0, 1);
      const assignment = prompt.sectionPrimaryAssignments.find(
        (item) => item.sectionKey === sectionKey,
      );
      const primary = prompt.sentences.find(
        (sentence) => sentence.sentenceId === assignment?.primarySentenceId,
      );
      if (primary === undefined)
        throw new TypeError("chair section has no assigned primary");
      const bilingual = { ...primary.text };
      if (firstLaunch && sectionKey === "ten_second_brief") {
        if (this.fault === "invent_price") bilingual.en += " Target price 999.";
        if (this.fault === "invent_number") bilingual.en += " Revenue is 777.";
        if (this.fault === "invent_probability")
          bilingual.en += " Probability is 80%.";
        if (this.fault === "invent_recommendation") bilingual.en += " Buy now.";
        if (this.fault === "ko_mismatch") bilingual.ko += " unaudited mismatch";
      }
      const primarySentenceId = primary.sentenceId;
      return {
        sectionKey,
        publicSummary: bilingual,
        primarySentenceId,
        sentenceIds,
        conflictAdjudication:
          sectionKey === "supported_analysis" &&
          prompt.teamConflictContract.detected
            ? {
                departmentDecisionSentenceIds:
                  prompt.teamConflictContract
                    .requiredDepartmentDecisionSentenceIds,
                resolution: "proof_required" as const,
                reasonSentenceId: primarySentenceId,
              }
            : null,
      };
    });
    const decisive = prompt.sentences.find(
      (sentence) =>
        sentence.sentenceId ===
        prompt.directionalBriefContract.roles.decisive.assignedSentenceId,
    );
    const countercase = prompt.sentences.find(
      (sentence) =>
        sentence.sentenceId ===
        prompt.directionalBriefContract.roles.countercase.assignedSentenceId,
    );
    const falsifier = prompt.sentences.find(
      (sentence) =>
        sentence.sentenceId ===
        prompt.directionalBriefContract.roles.falsifier.assignedSentenceId,
    );
    if (
      decisive === undefined ||
      countercase === undefined ||
      falsifier === undefined
    )
      return this.chairResult(input, {});
    if (
      (firstLaunch &&
        [
          "invent_claim",
          "invent_source",
          "drop_dissent",
          "invalid_first",
          "crash_first",
          "lost_first",
          "uncertain_first",
        ].includes(this.fault)) ||
      this.fault === "invalid"
    )
      sections = sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, "sentence:not-in-catalog"],
            }
          : section,
      );
    if (firstLaunch && this.fault === "drop_unknown")
      sections = sections.map((section) =>
        section.sectionKey === "dissent_unknowns"
          ? {
              ...section,
              primarySentenceId: "sentence:not-in-catalog",
              sentenceIds: ["sentence:not-in-catalog"],
            }
          : section,
      );
    if (firstLaunch && this.fault === "ko_mismatch")
      sections = sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: { ...section.publicSummary, ko: "CLAIM A" },
            }
          : section,
      );
    return this.chairResult(input, {
      kind: "chair_synthesis",
      decisionBrief: {
        stance: prompt.directionalBriefContract.requiredStance,
        confidence: prompt.directionalBriefContract.requiredConfidence,
        decisiveReason:
          prompt.directionalBriefContract.roles.decisive.canonicalText,
        strongestCountercase:
          prompt.directionalBriefContract.roles.countercase.canonicalText,
        falsifier:
          prompt.directionalBriefContract.roles.falsifier.canonicalText,
        decisiveSentenceId: decisive.sentenceId,
        countercaseSentenceId: countercase.sentenceId,
        falsifierSentenceId: falsifier.sentenceId,
        primaryClaimIds:
          prompt.directionalBriefContract.requiredPrimaryClaimIds,
        primarySentenceIds:
          prompt.directionalBriefContract.requiredPrimarySentenceIds,
      },
      selectedUnknownIds: prompt.unknownIds.slice(0, 1),
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
          "fb2b6b35789e59c885cf4d2aee12475809dd67b2c10df580e638122fd6b3438e",
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
  const requestDatabase = new Database(prepared.options.databasePath);
  requestDatabase
    .prepare(`INSERT OR IGNORE INTO research_requests(
      run_id, principal_id, symbol, question, locale, request_hash, created_at)
      VALUES (?, ?, 'TEST', 'Evaluate authenticated committee evidence', 'en', ?, ?)`)
    .run(
      runId,
      "a".repeat(64),
      hashCanonical({ runId, kind: "chair-test-request" }),
      "2026-07-23T00:00:00.000Z",
    );
  requestDatabase.close();
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
  const adjudicatedClaimId = retention.dissentClaimIds[0];
  const baseClaim = baseStructuralInput.claims[0];
  if (adjudicatedClaimId === undefined || baseClaim === undefined)
    throw new TypeError("chair fixture requires one adjudicated claim");
  const supportingAssignmentIndex =
    prepared.harness.input.assignments.assignments.findIndex(
      (assignment) => assignment.roleId !== "market_news",
    );
  const supportingAssignment =
    prepared.harness.input.assignments.assignments[supportingAssignmentIndex];
  if (supportingAssignment === undefined)
    throw new TypeError("chair fixture requires one supporting assignment");
  const supportingClaimId = specialistRequest(
    prepared.harness.input,
    supportingAssignment,
    { ordinal: supportingAssignmentIndex + 1, purpose: "mandatory_first" },
  ).claimSlots[0]!.claimId;
  const originalClaim = baseClaim.claim;
  const fixtureClaim = (claimId: z.infer<typeof ClaimIdSchema>) =>
    createAtomicClaim({
      claimId,
      runId: originalClaim.runId,
      snapshotId: originalClaim.snapshotId,
      text: originalClaim.text,
      epistemicClass: originalClaim.epistemicClass,
      stance: originalClaim.stance,
      materiality: originalClaim.materiality,
      claimType: originalClaim.claimType,
      supportingEvidence: originalClaim.supportingEvidence,
      opposingEvidence: originalClaim.opposingEvidence,
      asOf: originalClaim.asOf,
      freshness: originalClaim.freshness,
      uncertainty: originalClaim.uncertainty,
      ...(originalClaim.changeCondition === undefined
        ? {}
        : {
            changeCondition: {
              en: originalClaim.changeCondition.en,
              ko: originalClaim.changeCondition.ko,
              ...(originalClaim.changeCondition.triggerEvidenceIds === undefined
                ? {}
                : {
                    triggerEvidenceIds:
                      originalClaim.changeCondition.triggerEvidenceIds,
                  }),
            },
          }),
      auditStatus: originalClaim.auditStatus,
      auditReasons: originalClaim.auditReasons,
      unsupportedFragments: originalClaim.unsupportedFragments,
    });
  const structuralInput = {
    ...baseStructuralInput,
    claims: [
      {
        ...baseClaim,
        claim: fixtureClaim(adjudicatedClaimId),
      },
      { ...baseClaim, claim: fixtureClaim(supportingClaimId) },
    ],
    localizedClaimIds: {
      en: [adjudicatedClaimId, supportingClaimId],
      ko: [adjudicatedClaimId, supportingClaimId],
    },
    retainedDissentClaimIds: retention.dissentClaimIds.filter((claimId) =>
      [adjudicatedClaimId, supportingClaimId].includes(claimId),
    ),
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
  const claimC = ClaimIdSchema.parse("33333333-3333-4333-8333-333333333333");
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
    auditedClaimIds: [claimA, claimB, claimC],
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
    unknownIds: [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ],
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
      {
        sentenceId: `claim:${claimC}`,
        kind: "claim",
        claimIds: [claimC],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Valuation C", ko: "가치평가 C" },
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
        sentenceId: "unknown:66666666-6666-4666-8666-666666666666",
        kind: "unknown",
        claimIds: [],
        sourceArtifactIds: [sourceArtifactIds[0]],
        text: { en: "Trigger unknown", ko: "변경 미확인" },
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
  const idsBySection: Readonly<
    Record<(typeof CHAIR_SECTION_KEYS)[number], readonly string[]>
  > = {
    ten_second_brief: [
      `claim:${claimA}`,
      `dissent:${claimB}`,
      `change_condition:${claimB}`,
    ],
    supported_analysis: positions
      .slice(1)
      .concat(positions.slice(0, 1))
      .map((sentence) => sentence.sentenceId),
    valuation_comparison: [`claim:${claimC}`],
    operational_scenarios: ["scenario:revenue"],
    dissent_unknowns: ["unknown:55555555-5555-4555-8555-555555555555"],
    change_conditions: ["unknown:66666666-6666-4666-8666-666666666666"],
  };
  const sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
    const selected = idsBySection[sectionKey].flatMap((sentenceId) => {
      const sentence = prompt.sentences.find(
        (item) => item.sentenceId === sentenceId,
      );
      return sentence === undefined ? [] : [sentence];
    });
    const primary = selected[0];
    if (primary === undefined)
      throw new TypeError("chair fixture section is empty");
    return {
      sectionId: sectionKey,
      sectionKey,
      primarySentenceId: primary.sentenceId,
      sentenceIds: selected.map((sentence) => sentence.sentenceId),
      auditedClaimIds: [
        ...new Set(selected.flatMap((sentence) => sentence.claimIds)),
      ],
      sourceArtifactIds: [
        ...new Set(selected.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
      publicSummary:
        sectionKey === "supported_analysis"
          ? {
              en: "company position conflicts with market position",
              ko: "company 입장과 market 입장이 충돌합니다",
            }
          : {
              en: selected.map((sentence) => sentence.text.en).join(" "),
              ko: selected.map((sentence) => sentence.text.ko).join(" "),
            },
      ...(sectionKey === "supported_analysis"
        ? {
            conflictAdjudication: {
              departmentDecisionSentenceIds: selected
                .slice(0, 2)
                .map((sentence) => sentence.sentenceId),
              resolution: "proof_required" as const,
              reasonSentenceId: selected[0]!.sentenceId,
            },
          }
        : {}),
    };
  });
  const candidate = ChairSynthesisOutputSchema.parse({
    kind: "chair_synthesis",
    sourceArtifactIds,
    decisionBrief: {
      stance: "wait_for_proof",
      confidence: "medium",
      decisiveReason: { en: "Claim A", ko: "주장 A" },
      strongestCountercase: { en: "Dissent B", ko: "반대 B" },
      falsifier: { en: "Change B", ko: "변경 B" },
      decisiveSentenceId: `claim:${claimA}`,
      countercaseSentenceId: `dissent:${claimB}`,
      falsifierSentenceId: `change_condition:${claimB}`,
      primaryClaimIds: [claimA],
      primarySentenceIds: [`claim:${claimA}`],
    },
    sections,
    ballotArtifactIds: ballotIds,
    dissentClaimIds: [claimB],
    selectedUnknownIds: ["55555555-5555-4555-8555-555555555555"],
    unknowns: [{ en: "Unknown", ko: "미확인" }],
  });
  return { prompt, candidate, claimB };
}
