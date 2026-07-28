import { describe, expect, it } from "vitest";
import {
  type AtomicClaim,
  AtomicClaimSchema,
  auditAtomicClaim,
  createAtomicClaim,
} from "./claims";

const CLAIM_BASE = {
  claimId: "00000000-0000-4000-8000-000000000011",
  runId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  reportVersionId: "00000000-0000-4000-8000-000000000003",
  epistemicClass: "fact" as const,
  materiality: "material" as const,
  stance: "positive" as const,
  claimType: "operating_performance",
  freshness: "fresh" as const,
  uncertainty: "low" as const,
  asOf: "2026-07-22T00:03:00.000Z",
  supportingEvidence: [
    { evidenceId: "evidence-1", locatorHash: "a".repeat(64) },
  ],
  opposingEvidence: [],
  changeCondition: {
    en: "Reassess if operating margin falls below 15%.",
    ko: "영업이익률이 15% 아래로 떨어지면 재평가합니다.",
  },
};

describe("bilingual atomic claims", () => {
  it("keeps one claim identity across EN/KO and records support/opposition", () => {
    const claim = createAtomicClaim({
      ...CLAIM_BASE,
      text: {
        en: "Operating margin improved to 20%.",
        ko: "영업이익률이 20%로 개선되었습니다.",
      },
    });
    expect(claim.claimId).toBe(CLAIM_BASE.claimId);
    expect(claim.text.en).not.toBe(claim.text.ko);
    expect(claim.supportingEvidence).toHaveLength(1);
    expect(claim.claimHash).toMatch(/^[a-f0-9]{64}$/);
    expect(auditAtomicClaim(claim).kind).toBe("accepted");
  });

  it("requires material claims to carry supporting evidence and blocks unsupported claims", () => {
    const result = createAtomicClaim({
      ...CLAIM_BASE,
      supportingEvidence: [],
      text: { en: "Revenue grew.", ko: "매출이 증가했습니다." },
    });
    expect(auditAtomicClaim(result).kind).toBe("blocked");
    const audit = auditAtomicClaim(result);
    if (audit.kind === "blocked") expect(audit.reason).toMatch(/evidence/i);
  });

  it("retains opposing evidence and uncertainty/change conditions", () => {
    const claim = createAtomicClaim({
      ...CLAIM_BASE,
      epistemicClass: "interpretation",
      uncertainty: "medium",
      opposingEvidence: [
        {
          evidenceId: "evidence-2",
          locatorHash: "b".repeat(64),
          reason: "restated period",
        },
      ],
      text: {
        en: "The margin trend may persist.",
        ko: "마진 추세가 지속될 수 있습니다.",
      },
    });
    expect(claim.opposingEvidence[0]?.reason).toBe("restated period");
    expect(claim.uncertainty).toBe("medium");
    expect(claim.changeCondition?.en).toContain("15%");
  });

  it("rejects mismatched locale IDs, invalid freshness, and client/model authority fields", () => {
    expect(() =>
      AtomicClaimSchema.parse({
        ...createAtomicClaim({ ...CLAIM_BASE, text: { en: "A", ko: "가" } }),
        text: { en: "A", ko: "가" },
        claimId: "00000000-0000-4000-8000-000000000099",
      }),
    ).toThrow(/hash|claim|identity/i);
    expect(() =>
      AtomicClaimSchema.parse({
        ...CLAIM_BASE,
        text: { en: "A", ko: "가" },
        freshness: "unknown-state",
      }),
    ).toThrow();
    expect(() =>
      AtomicClaimSchema.parse({
        ...CLAIM_BASE,
        text: { en: "A", ko: "가" },
        authority: "model",
      }),
    ).toThrow();
  });

  it("preserves explicit unknown claims without inventing zero values", () => {
    const unknown: AtomicClaim = createAtomicClaim({
      ...CLAIM_BASE,
      epistemicClass: "unknown",
      materiality: "supporting",
      uncertainty: "high",
      unknownReason: "not_disclosed",
      supportingEvidence: [],
      text: {
        en: "Operating margin is unknown because it was not disclosed.",
        ko: "공시되지 않아 영업이익률은 알 수 없습니다.",
      },
    });
    expect(auditAtomicClaim(unknown).kind).toBe("accepted");
    expect("value" in unknown).toBe(false);
  });

  it("rejects calendar-invalid and offset-invalid claim instants", () => {
    expect(
      createAtomicClaim({
        ...CLAIM_BASE,
        asOf: "2026-07-22T09:03:00.000+09:00",
        text: { en: "Valid offset.", ko: "유효한 오프셋입니다." },
      }).asOf,
    ).toBe("2026-07-22T09:03:00.000+09:00");
    expect(() =>
      createAtomicClaim({
        ...CLAIM_BASE,
        asOf: "2026-02-30T00:00:00.000Z",
        text: { en: "Invalid date.", ko: "잘못된 날짜입니다." },
      }),
    ).toThrow(/timestamp|date/i);
    expect(() =>
      createAtomicClaim({
        ...CLAIM_BASE,
        asOf: "2026-07-22T00:03:00.000+24:00",
        text: { en: "Invalid offset.", ko: "잘못된 오프셋입니다." },
      }),
    ).toThrow(/timestamp|date|offset/i);
  });
});
