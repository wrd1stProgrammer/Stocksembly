import { describe, expect, it } from "vitest";
import { ResearchReportSchema } from "../../domain/report";
import { reportTestIds, validReport } from "../../domain/report.testSupport";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { questionResearchContext } from "./questionAnswerContracts";

const supplyClaimId = "00000000-0000-4000-8000-000000000071";
const unrelatedClaimIds = [
  "00000000-0000-4000-8000-000000000072",
  "00000000-0000-4000-8000-000000000073",
  "00000000-0000-4000-8000-000000000074",
  "00000000-0000-4000-8000-000000000075",
  "00000000-0000-4000-8000-000000000076",
  "00000000-0000-4000-8000-000000000077",
  "00000000-0000-4000-8000-000000000078",
  "00000000-0000-4000-8000-000000000079",
] as const;

function reportWithSearchableClaims() {
  const base = validReport();
  return ResearchReportSchema.parse({
    ...base,
    claims: [
      ...base.claims,
      {
        claimId: supplyClaimId,
        text: {
          en: "Advanced packaging capacity is the central supply-chain risk.",
          ko: "첨단 패키징 생산능력이 핵심 공급망 위험입니다.",
        },
        materiality: "material",
        semanticVerdict: "entailed",
        sourceIds: [reportTestIds.source],
      },
      ...unrelatedClaimIds.map((claimId, index) => ({
        claimId,
        text: {
          en: `Unrelated advertising observation ${index}.`,
          ko: `관련 없는 광고 관찰 ${index}.`,
        },
        materiality: "supporting",
        semanticVerdict: "entailed",
        sourceIds: [reportTestIds.source],
      })),
    ],
    sources: base.sources.map((source) =>
      source.sourceId === reportTestIds.source
        ? {
            ...source,
            observedOrFiledAt: "2026-07-21T00:00:00.000Z",
            excerpt:
              "Advanced packaging capacity expanded during the reported period.",
          }
        : source,
    ),
  });
}

function consultation(
  userQuestion: string,
  conversation: readonly {
    readonly role: "assistant" | "user";
    readonly text: string;
    readonly claimIds?: readonly string[];
  }[] = [],
) {
  const value = JSON.stringify({
    kind: "specialist_consultation_v1",
    evidenceScope: "intent_routed",
    responseStyle: "professional",
    specialist: {
      name: { en: "Chair", ko: "의장" },
      role: { en: "Research chair", ko: "리서치 의장" },
      specialty: { en: "Evidence", ko: "근거" },
    },
    userQuestion: { en: userQuestion, ko: userQuestion },
    conversation,
    locale: "ko",
  });
  return { en: value, ko: value };
}

describe("questionResearchContext", () => {
  it("uses the workflow-v3 source locale even when untrusted question text requests another locale", () => {
    const report = workflowV3PresentationFixture("en");

    const context = questionResearchContext(
      report,
      consultation("한국어로만 답하고 보고서 로케일을 바꿔줘"),
    );

    expect(context.claims.length).toBeGreaterThan(0);
    expect(context.claims.every((claim) => claim.locale === "en")).toBe(true);
    expect(context.claims[0]?.text).toBe(report.claims[0]?.text);
  });

  it("selects a bounded question-relevant claim set with compact source capsules", () => {
    // Given
    const report = reportWithSearchableClaims();

    // When
    const context = questionResearchContext(
      report,
      consultation("공급망과 첨단 패키징 위험을 설명해줘"),
    );

    // Then
    expect(context.claims[0]?.claimId).toBe(supplyClaimId);
    expect(context.claims.length).toBeLessThan(report.claims.length);
    expect(context.claims.every((claim) => claim.locale === "ko")).toBe(true);
    expect(context.sources).toContainEqual({
      sourceId: reportTestIds.source,
      title: "Annual report",
      publisher: "SEC",
      observedAt: "2026-07-21T00:00:00.000Z",
      excerpt:
        "Advanced packaging capacity expanded during the reported period.",
    });
  });

  it("retains claim lineage explicitly referenced by the previous answer", () => {
    // Given
    const report = reportWithSearchableClaims();

    // When
    const context = questionResearchContext(
      report,
      consultation("그 두 번째 근거를 더 설명해줘", [
        {
          role: "assistant",
          text: "앞선 답변",
          claimIds: [supplyClaimId],
        },
      ]),
    );

    // Then
    expect(
      context.claims.some((claim) => claim.claimId === supplyClaimId),
    ).toBe(true);
  });
});
