import { z } from "zod";
import {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
} from "../domain/agentOutputs";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { JobIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import type {
  DepartmentJobPrompt,
  PersistedDepartmentJob,
  StageDepartmentRoundResult,
} from "./departmentRoundContracts";
import {
  DepartmentJobPromptSchema,
  PersistedDepartmentJobSchema,
} from "./departmentRoundContracts";
import type { AcceptedMemoRow } from "./departmentRoundSqliteAuthority";

const MemoEnvelopeSchema = z
  .object({
    workflowVersion: z.literal("WorkflowV1"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string().regex(/^memo:[a-z_]+$/),
    roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    stage: z.literal("memo"),
    outputHash: ArtifactDigestSchema,
    payload: MemoOutputSchema,
  })
  .passthrough();

function uuidFrom(value: unknown): string {
  const hash = hashCanonical(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sameMembers(
  expected: readonly string[],
  received: readonly string[],
): boolean {
  return (
    expected.length === received.length &&
    new Set(received).size === received.length &&
    expected.every((value) => received.includes(value))
  );
}

const DEPARTMENT_EDITORIAL_DIRECTION = {
  market:
    "Market team: separate regime, relative strength, valuation/flow pressure, and the next dated catalyst. State one confirmation signal, one watch condition, and one invalidation signal. Prefer observed price, change, relative performance, rates, and peer context over generic demand commentary.",
  company:
    "Company team: decompose the thesis into growth engines, customer or segment concentration, moat layers, and execution dependencies. Distinguish an announced product advantage from proof of production adoption. State the next operating milestone and the concrete path that would erode the moat.",
  financial:
    "Financial team: trace revenue growth through gross margin, operating margin, cash conversion, reinvestment, and valuation. Distinguish operating quality from what the current multiple already requires. State the measurable expectation that must hold and the threshold that would reset the safety-margin view.",
  risk: "Risk team: rank distinct failure paths by impact and observability, identify compound downside interactions, name a leading indicator for each major risk, and distinguish mitigants from thesis breakers. Avoid a generic risk list; state the escalation sequence an investor can monitor.",
} as const;

export async function authenticatedMemoPrompts(
  cas: ArtifactCasPort,
  rows: readonly AcceptedMemoRow[],
  input: { readonly runId: string; readonly artifactIds: readonly string[] },
): Promise<
  | {
      readonly kind: "accepted";
      readonly prompts: readonly DepartmentJobPrompt[];
    }
  | {
      readonly kind: "blocked";
      readonly reason: Extract<
        StageDepartmentRoundResult,
        { readonly kind: "blocked" }
      >["reason"];
    }
> {
  if (rows.length === 0 || input.artifactIds.length !== rows.length)
    return { kind: "blocked", reason: "accepted_specialist_set_incomplete" };
  const rowIds = rows.map((row) => row.artifact_id);
  if (!sameMembers(rowIds, input.artifactIds))
    return { kind: "blocked", reason: "cross_run_or_snapshot_member" };
  const members: DepartmentJobPrompt["memberArtifacts"][number][] = [];
  for (const row of rows) {
    const read = await cas.get(ArtifactDigestSchema.parse(row.content_hash));
    if (
      read === undefined ||
      read.descriptor.artifactId !== row.artifact_id ||
      read.descriptor.runId !== row.run_id ||
      read.descriptor.snapshotId !== row.snapshot_id ||
      read.descriptor.digest !== row.content_hash ||
      hashBytes(read.bytes) !== row.content_hash
    )
      return {
        kind: "blocked",
        reason: "member_artifact_authentication_failed",
      };
    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch (error) {
      if (error instanceof SyntaxError)
        return {
          kind: "blocked",
          reason: "member_artifact_authentication_failed",
        };
      throw error;
    }
    const envelope = MemoEnvelopeSchema.safeParse(decoded);
    const roleId = row.logical_artifact_key.replace(/^memo:/, "");
    if (
      !envelope.success ||
      envelope.data.runId !== input.runId ||
      envelope.data.runId !== row.run_id ||
      envelope.data.snapshotId !== row.snapshot_id ||
      envelope.data.roleId !== roleId ||
      envelope.data.logicalArtifactId !== row.logical_artifact_key ||
      envelope.data.outputHash !== hashCanonical(envelope.data.payload)
    )
      return {
        kind: "blocked",
        reason: "member_artifact_authentication_failed",
      };
    members.push({
      artifactId: row.artifact_id,
      contentHash: row.content_hash,
      ownership: { roleId: envelope.data.roleId },
      memo: envelope.data.payload,
    });
  }
  const prompts = WORKFLOW_V1_DEPARTMENT_IDS.flatMap((departmentId) => {
    const department = WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId];
    const memberArtifacts = department.memberIds.flatMap((roleId) => {
      const member = members.find(
        (candidate) => candidate.ownership.roleId === roleId,
      );
      return member === undefined ? [] : [member];
    });
    const groundedNumericTokens = [
      ...new Set(
        memberArtifacts
          .flatMap((member) => [
            ...member.memo.positions.flatMap((position) => [
              position.publicSummary.en,
              position.publicSummary.ko,
              ...(position.strongestContraryObservation === undefined
                ? []
                : [
                    position.strongestContraryObservation.en,
                    position.strongestContraryObservation.ko,
                  ]),
              ...(position.falsifier === undefined
                ? []
                : [position.falsifier.en, position.falsifier.ko]),
            ]),
            ...member.memo.dissent.flatMap((item) => [
              item.publicSummary.en,
              item.publicSummary.ko,
            ]),
            ...member.memo.unknowns.flatMap((item) => [item.en, item.ko]),
          ])
          .flatMap((text) => text.match(/\d+(?:[.,]\d+)*/gu) ?? []),
      ),
    ];
    return memberArtifacts.length === department.memberIds.length
      ? [
          DepartmentJobPromptSchema.parse({
            kind: "department_consolidation_input_v1",
            department: {
              id: departmentId,
              leadId: department.leadId,
              memberIds: department.memberIds,
            },
            memberArtifacts,
            editorialBrief: [
              "Produce a decision-dense specialist-team synthesis, not a stitched recap of member memos.",
              DEPARTMENT_EDITORIAL_DIRECTION[departmentId],
              "publicSummary must answer the investment question once in at most two sentences: lead with the decision, include the most decision-relevant quantified fact when available, and name one uncertainty that can actually change the view.",
              "Take the best-supported current side. Do not make the team position a list of conditions or default to qualified neutrality: state what the team believes now, why it matters to an investor, and reserve one observable reversal condition for the end.",
              "When member evidence contains a named company comparison, explicitly choose the stronger company for this department's decision dimensions and explain the trade-off. Do not replace the requested company comparison with a generic sector or peer-data caveat.",
              "Select accepted, strongest, weakest, revised, and removed claims according to evidence quality. Do not accept every claim by default.",
              "Classify every filled member claim exactly once with dispositions: accept, revise, or remove. Give every disposition a specific bilingual reason. Keep acceptedClaimIds, revisedClaimIds, and removedClaimIds disjoint and exhaustive.",
              "For each revised claim, retain its authenticated originClaimId and exact sourceArtifactIds in revisions, provide revised bilingual publicSummary, a claim-specific falsifier, and reason. Use originClaimId as the adjudicatedClaimId placeholder and a 64-character lowercase hexadecimal revisionHash placeholder; the trusted boundary derives the distinct deterministic adjudicatedClaimId and content hash.",
              "For every revised claim, copy the matching disposition.reason exactly into revision.reason in both languages; the trusted boundary requires byte-for-byte equality between those two reason objects.",
              `Every numeric token anywhere in the output, including summaries, reasons, falsifiers, dissent, and open questions, must come from this complete allowlist derived from member public summaries, dissent summaries, and unknowns: ${JSON.stringify(groundedNumericTokens)}. Do not use any other numeric token, reuse a number that appears only in a member falsifier, or invent a count, duration, threshold, or date.`,
              "Strongest and weakest claims may reference only accepted or revised claims. If no accepted or revised claim survives, return a targeted rewrite instead of a consolidation.",
              "Keep different roles distinct: each accepted claim should contribute a different decision dimension rather than restating the same growth or risk sentence.",
              "Give every accepted claim its own non-overlapping checkpoint: use a different metric, threshold, disclosure, customer signal, or dated event for each claim. Never copy one change condition into several claims.",
              "Do not reuse publicSummary, the same conclusion sentence, or the same checkpoint language across strongestClaim, weakestClaim, openQuestions, and claim rationales.",
              "Return no more than two openQuestions. Phrase each as an observable metric, threshold, disclosure, or dated event that would resolve uncertainty.",
              "Never use missing-data disclaimers, provider/licensing language, report-scope disclaimers, or investment-recommendation disclaimers as publicSummary or openQuestions.",
              "Do not repeat a member publicSummary verbatim when a concise synthesis can preserve the same grounded facts.",
            ].join(" "),
          }),
        ]
      : [];
  });
  return prompts.length === 0
    ? { kind: "blocked", reason: "accepted_specialist_set_incomplete" }
    : { kind: "accepted", prompts };
}

export function departmentJobs(
  runId: string,
  snapshotId: string,
  prompts: readonly DepartmentJobPrompt[],
): readonly PersistedDepartmentJob[] {
  return prompts.map((request) => {
    const prompt = JSON.stringify(request);
    const memberArtifactIds = request.memberArtifacts.map(
      (member) => member.artifactId,
    );
    const citableArtifactIds = [
      ...new Set([
        ...memberArtifactIds,
        ...request.memberArtifacts.flatMap((member) => [
          ...member.memo.sourceArtifactIds,
          ...member.memo.positions.flatMap(
            (position) => position.evidenceArtifactIds,
          ),
        ]),
      ]),
    ];
    return PersistedDepartmentJobSchema.parse({
      runId,
      snapshotId,
      departmentId: request.department.id,
      leadId: request.department.leadId,
      jobId: JobIdSchema.parse(
        uuidFrom({ runId, departmentId: request.department.id }),
      ),
      logicalArtifactId: `consolidation:${request.department.id}`,
      prompt,
      inputHash: codexInputHash({
        stage: "department_consolidation",
        prompt,
        outputSchema: DepartmentConsolidationOutputSchema,
      }),
      inputManifestHash: hashCanonical(
        request.memberArtifacts.map((member) => ({
          artifactId: member.artifactId,
          contentHash: member.contentHash,
          roleId: member.ownership.roleId,
        })),
      ),
      memberArtifactIds,
      citableArtifactIds,
    });
  });
}
