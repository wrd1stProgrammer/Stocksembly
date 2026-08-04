import { describe, expect, it } from "vitest";
import type { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import type { z } from "zod";
import { departmentCandidate } from "./departmentRoundCandidates.testSupport";
import type { DepartmentJobPrompt } from "./departmentRoundContracts";
import { DepartmentJobPromptSchema } from "./departmentRoundContracts";
import { departmentJobs } from "./departmentRoundInput";
import {
  hasOnlyGroundedNumbers,
  inspectDepartmentCandidate,
} from "./departmentRoundOutput";
import { publicArtifactEventFields } from "./publicEventsArtifact";

const IDS = {
  run: "11111111-1111-4111-8111-111111111111",
  snapshot: "22222222-2222-4222-8222-222222222222",
  memberA: "33333333-3333-4333-8333-333333333331",
  memberB: "33333333-3333-4333-8333-333333333332",
  evidenceA: "44444444-4444-4444-8444-444444444441",
  evidenceB: "44444444-4444-4444-8444-444444444442",
  accepted: "55555555-5555-4555-8555-555555555551",
  revised: "55555555-5555-4555-8555-555555555552",
  removed: "55555555-5555-4555-8555-555555555553",
} as const;

function text(en: string, ko = `${en} 근거`) {
  return { en, ko };
}

function request(): DepartmentJobPrompt {
  const position = (
    claimId: string,
    summary: string,
    evidenceArtifactId: string,
  ) => ({
    claimId,
    stance: "supports" as const,
    publicSummary: text(summary),
    evidenceArtifactIds: [evidenceArtifactId],
    falsifier: text(`${summary} claim-specific checkpoint`),
  });
  return DepartmentJobPromptSchema.parse({
    kind: "department_consolidation_input_v1",
    department: {
      id: "market",
      leadId: "market",
      memberIds: ["market", "market_news"],
    },
    memberArtifacts: [
      {
        artifactId: IDS.memberA,
        contentHash: "a".repeat(64),
        ownership: { roleId: "market" },
        memo: {
          kind: "memo",
          sourceArtifactIds: [IDS.evidenceA],
          positions: [
            position(IDS.accepted, "Price held 10 support", IDS.evidenceA),
            position(IDS.revised, "Momentum reached 20", IDS.evidenceA),
          ],
          dissent: [],
          unknowns: [text("Will volume confirm 20 momentum?")],
        },
      },
      {
        artifactId: IDS.memberB,
        contentHash: "b".repeat(64),
        ownership: { roleId: "market_news" },
        memo: {
          kind: "memo",
          sourceArtifactIds: [IDS.evidenceB],
          positions: [
            position(IDS.removed, "Rumor implies 30 upside", IDS.evidenceB),
          ],
          dissent: [],
          unknowns: [text("Will the dated filing confirm 30?")],
        },
      },
    ],
  });
}

function job() {
  return departmentJobs(IDS.run, IDS.snapshot, [request()])[0]!;
}

function candidate(): Record<string, unknown> {
  return {
    kind: "department_consolidation",
    sourceArtifactIds: [IDS.memberA, IDS.memberB],
    agreementClaimIds: [IDS.accepted, IDS.revised],
    disagreementClaimIds: [IDS.removed],
    acceptedClaimIds: [IDS.accepted],
    strongestClaimIds: [IDS.accepted],
    weakestClaimIds: [IDS.revised],
    revisedClaimIds: [IDS.revised],
    removedClaimIds: [IDS.removed],
    dispositions: [
      { claimId: IDS.accepted, disposition: "accept", reason: text("Retained because price evidence is direct") },
      { claimId: IDS.revised, disposition: "revise", reason: text("Narrowed to the observed momentum") },
      { claimId: IDS.removed, disposition: "remove", reason: text("Rumor lacks corroboration") },
    ],
    revisions: [
      {
        originClaimId: IDS.revised,
        adjudicatedClaimId: IDS.revised,
        publicSummary: text("Momentum reached 20 but needs volume confirmation"),
        falsifier: text("Momentum fails if volume does not confirm 20"),
        revisionHash: "0".repeat(64),
        reason: text("Narrowed to the observed momentum"),
        sourceArtifactIds: [IDS.evidenceA],
      },
    ],
    publicSummary: text("Lead decision: retain support while 20 momentum awaits volume."),
    dissent: [],
    openQuestions: [
      text("Will volume confirm 20 momentum?"),
      text("Will the dated filing confirm 30?"),
    ],
    evidencePriorityArtifactIds: [IDS.evidenceA],
  };
}

describe("department adjudication trust boundary", () => {
  it("characterizes authenticated ID/evidence plus number and actor failures", () => {
    const base = departmentCandidate(request(), "none");
    expect(inspectDepartmentCandidate(job(), base)).toBeDefined();
    expect(
      inspectDepartmentCandidate(job(), {
        ...base,
        acceptedClaimIds: ["77777777-7777-4777-8777-777777777777"],
      }),
    ).toBeUndefined();
    expect(inspectDepartmentCandidate(job(), base)?.evidencePriorityArtifactIds)
      .toEqual([IDS.evidenceA]);
    expect(hasOnlyGroundedNumbers(["Unsupported 99 result"], ["Observed 10"]))
      .toBe(false);
    const actorRequest = request();
    const actorPosition = actorRequest.memberArtifacts[0]?.memo.positions[0];
    expect(actorPosition).toBeDefined();
    const actorPrompt = {
      ...actorRequest,
      memberArtifacts: actorRequest.memberArtifacts.map((member, index) =>
        index !== 0
          ? member
          : {
              ...member,
              memo: {
                ...member.memo,
                positions: member.memo.positions.map((position, positionIndex) =>
                  positionIndex === 0
                    ? { ...position, publicSummary: text("company_product said this is valid") }
                    : position,
                ),
              },
            },
      ),
    } as DepartmentJobPrompt;
    const actorJob = departmentJobs(IDS.run, IDS.snapshot, [actorPrompt])[0]!;
    expect(
      inspectDepartmentCandidate(
        actorJob,
        departmentCandidate(actorPrompt, "none"),
      ),
    ).toBeUndefined();
  });

  it("preserves exhaustive accepted, revised, and removed decisions", () => {
    const input = candidate();
    const before = JSON.stringify(input);
    const inspected = inspectDepartmentCandidate(job(), input) as
      | z.infer<typeof DepartmentConsolidationOutputSchema>
      | undefined;
    expect(inspected).toBeDefined();
    expect(inspected?.acceptedClaimIds).toEqual([IDS.accepted]);
    expect(inspected?.removedClaimIds).toEqual([IDS.removed]);
    expect(inspected?.publicSummary).toEqual(candidate()["publicSummary"]);
    expect(inspected?.revisions[0]?.revisionHash).not.toBe("0".repeat(64));
    expect(inspected?.revisions[0]?.sourceArtifactIds).toEqual([IDS.evidenceA]);
    const adjudicatedClaimId = (
      inspected?.revisions[0] as unknown as {
        readonly adjudicatedClaimId?: string;
      }
    )?.adjudicatedClaimId;
    expect(adjudicatedClaimId).toBeDefined();
    expect(adjudicatedClaimId).not.toBe(IDS.revised);
    expect(inspected?.revisedClaimIds).toEqual([adjudicatedClaimId]);
    expect(inspected?.weakestClaimIds).toEqual([adjudicatedClaimId]);
    const eventClaimIds = publicArtifactEventFields(inspected!).claimIds;
    expect(eventClaimIds).not.toContain(IDS.removed);
    expect(eventClaimIds).not.toContain(IDS.revised);
    expect(eventClaimIds).toContain(adjudicatedClaimId);
    expect(JSON.stringify(input)).toBe(before);
    expect(inspectDepartmentCandidate(job(), input)).toEqual(inspected);
  });

  it("allows a duplicate opposing position to be removed without treating it as mandatory dissent", () => {
    const opposingRequest = {
      ...request(),
      memberArtifacts: request().memberArtifacts.map((member, memberIndex) =>
        memberIndex !== 1
          ? member
          : {
              ...member,
              memo: {
                ...member.memo,
                positions: member.memo.positions.map((position) => ({
                  ...position,
                  stance: "opposes" as const,
                })),
              },
            },
      ),
    } as DepartmentJobPrompt;
    const [opposingJob] = departmentJobs(IDS.run, IDS.snapshot, [
      opposingRequest,
    ]);

    expect(opposingJob).toBeDefined();
    if (opposingJob === undefined) return;
    expect(inspectDepartmentCandidate(opposingJob, candidate())).toBeDefined();
  });

  it("rejects NFKC, punctuation, and whitespace-equivalent falsifiers", () => {
    const input = candidate();
    const revisions = input["revisions"] as Record<string, unknown>[];
    expect(
      inspectDepartmentCandidate(job(), {
        ...input,
        revisions: [
          {
            ...revisions[0],
            falsifier: {
              en: "Ｐrice held 10 support   claim-specific checkpoint!!!",
              ko: "Price held 10 support claim-specific checkpoint 근거!!!",
            },
          },
        ],
      }),
    ).toBeUndefined();
  });

  it.each([
    ["duplicate disposition", () => ({ dispositions: [...(candidate()["dispositions"] as unknown[]), (candidate()["dispositions"] as unknown[])[0]] })],
    ["missing disposition", () => ({ dispositions: (candidate()["dispositions"] as unknown[]).slice(0, 2) })],
    ["strongest removed", () => ({ strongestClaimIds: [IDS.removed] })],
    ["empty survivors", () => ({ acceptedClaimIds: [], revisedClaimIds: [], strongestClaimIds: [], weakestClaimIds: [] })],
    ["invalid revision lineage", () => ({ revisions: [{ ...(candidate()["revisions"] as Record<string, unknown>[])[0], originClaimId: IDS.removed }] })],
    ["invalid revision evidence", () => ({ revisions: [{ ...(candidate()["revisions"] as Record<string, unknown>[])[0], sourceArtifactIds: [IDS.evidenceB] }] })],
    [">2 questions", () => ({ openQuestions: [...(candidate()["openQuestions"] as unknown[]), text("Third question") ] })],
    ["missing reason", () => ({ dispositions: (candidate()["dispositions"] as Record<string, unknown>[]).map((item, index) => index === 0 ? { claimId: item["claimId"], disposition: item["disposition"] } : item) })],
    ["unknown evidence", () => ({ evidencePriorityArtifactIds: ["77777777-7777-4777-8777-777777777777"] })],
    ["unsupported number", () => ({ publicSummary: text("Unsupported 99 result") })],
    ["foreign actor", () => ({ publicSummary: text("company_product said this is valid") })],
    ["removed prose leak", () => ({ openQuestions: [text("Rumor implies 30 upside")] })],
  ] as const)("rejects %s", (_label, mutate) => {
    expect(
      inspectDepartmentCandidate(job(), { ...candidate(), ...mutate() }),
    ).toBeUndefined();
  });
});
