import { describe, expect, it } from "vitest";
import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_ROSTER_FINGERPRINT,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import { createResearchMandate, MandateAdmissionError } from "./createMandate";
import {
  admissionFor,
  makeMandateHarness,
  requireMandate,
} from "./createMandate.testSupport";

describe("ResearchMandateV1", () => {
  it("seals broad and focused mandates only after the authoritative snapshot lifecycle", async () => {
    // Given
    const broad = await makeMandateHarness({ scope: "broad" });
    const focused = await makeMandateHarness({
      scope: "focused",
      question: "How durable are product adoption and margins?",
    });

    // When
    const [broadResult, focusedResult] = await Promise.all([
      createResearchMandate(broad.input, broad.dependencies),
      createResearchMandate(focused.input, focused.dependencies),
    ]);

    // Then
    const broadMandate = requireMandate(broadResult);
    const focusedMandate = requireMandate(focusedResult);
    expect(broad.repository.operations).toEqual([
      "run_created",
      "collection_started",
      "evidence_cutoff_recorded",
      "snapshot_sealed",
    ]);
    expect(broad.repository.persistedMandates).toEqual([]);
    expect(broad.repository.persistedEvents).toEqual([]);
    expect(Date.parse(broadMandate.mandateSealedAt)).toBeGreaterThanOrEqual(
      Date.parse(broad.snapshot.snapshotSealedAt),
    );
    expect(focusedMandate.question).toBe(
      "How durable are product adoption and margins?",
    );
    expect(broadMandate.scope).toBe("broad");
    expect(focusedMandate.scope).toBe("focused");
    expect(focusedMandate.materialCruxes).not.toEqual(
      broadMandate.materialCruxes,
    );
    expect(broadMandate.briefing).toEqual({
      kind: "mandate_briefing",
      author: "system",
      source: "code",
    });
    expect(broadMandate.specialistRoleIds).toEqual(WORKFLOW_V1_SPECIALIST_IDS);
    expect(broadMandate.chairRoleId).toBe(WORKFLOW_V1_CHAIR_ID);
    expect(broadMandate.rosterFingerprint).toBe(WORKFLOW_V1_ROSTER_FINGERPRINT);
    expect(broadMandate.limitations.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "current_market_data_unavailable",
        "consensus_unavailable",
      ]),
    );
    const firstLimitation = broadMandate.limitations[0];
    const firstCapability = broadMandate.capabilities.disclosures[0];
    if (firstLimitation === undefined || firstCapability === undefined)
      throw new TypeError("mandate fixture requires nested metadata");
    const originalHash = broadMandate.mandateHash;
    expect(Reflect.set(broadMandate.materialCruxes, "0", "tampered")).toBe(
      false,
    );
    expect(Reflect.set(firstLimitation, "detail", "tampered")).toBe(false);
    expect(Reflect.set(firstCapability.state, "availability", "tampered")).toBe(
      false,
    );
    expect(broadMandate.mandateHash).toBe(originalHash);
    expect(Object.isFrozen(broadMandate.capabilities.disclosures)).toBe(true);
    expect(Object.isFrozen(firstCapability.state)).toBe(true);
  });

  it("rejects early, drifted, mismatched, and current-price mandate admissions without persistence", async () => {
    // Given
    const cases = [
      await makeMandateHarness({
        lifecycle: [
          "run_created",
          "collection_started",
          "evidence_cutoff_recorded",
        ],
      }),
      await makeMandateHarness({ rosterIds: ["market", "chair"] }),
      await makeMandateHarness({ mismatchCapabilities: true }),
      await makeMandateHarness({
        question: "What is the current share price?",
      }),
    ];

    // When
    const attempts = await Promise.all(
      cases.map((item) =>
        createResearchMandate(item.input, item.dependencies).catch(
          (error: unknown) => error,
        ),
      ),
    );

    // Then
    expect(attempts).toHaveLength(4);
    for (const attempt of attempts)
      expect(attempt).toBeInstanceOf(MandateAdmissionError);
    for (const item of cases)
      expect(item.repository.persistedMandates).toEqual([]);
  });

  it("rejects a tampered sealed snapshot and accepts an authoritative seal time equal to the snapshot seal", async () => {
    // Given
    const tampered = await makeMandateHarness();
    const equalTime = await makeMandateHarness({
      mandateSealedAt: "2026-07-22T00:05:00.000Z",
    });
    tampered.repository.admission = admissionFor({
      ...tampered.snapshot,
      manifestHash: "f".repeat(64),
    });

    // When
    const tamperedAttempt = createResearchMandate(
      tampered.input,
      tampered.dependencies,
    );
    const equalResult = await createResearchMandate(
      equalTime.input,
      equalTime.dependencies,
    );

    // Then
    await expect(tamperedAttempt).rejects.toMatchObject({
      code: "snapshot_hash_mismatch",
    });
    expect(requireMandate(equalResult).mandateSealedAt).toBe(
      equalTime.snapshot.snapshotSealedAt,
    );
  });
});
