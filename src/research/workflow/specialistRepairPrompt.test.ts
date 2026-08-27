import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexInputHash } from "../server/codex/codexReservation";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";
import {
  specialistPromptForDurableInput,
  specialistValidationCorrectivePrompt,
} from "./specialistRoundSqliteHandler";

describe("specialist validation corrective prompt", () => {
  it("turns a numeric binding rejection into an actionable repair instruction", () => {
    const prompt = specialistValidationCorrectivePrompt(
      "BASE PROMPT",
      "specialist_claim_numeric_metric_mismatch",
    );

    expect(prompt).toContain("CORRECTIVE RETRY — NUMERIC GROUNDING");
    expect(prompt).toContain("registeredValues[].valueId");
    expect(prompt).toContain("omit the percentage");
  });

  it("turns an evidence-type rejection into an actionable repair instruction", () => {
    const prompt = specialistValidationCorrectivePrompt(
      "BASE PROMPT",
      "specialist_claim_evidence_type_mismatch",
    );

    expect(prompt).toContain("CORRECTIVE RETRY — EVIDENCE TYPE");
    expect(prompt).toContain("Forms 3, 4, and 5");
    expect(prompt).toContain("10-K, 10-Q, 8-K");
  });

  it("replays the corrective prompt encoded by a durable retry input hash", () => {
    const corrective = specialistValidationCorrectivePrompt(
      "BASE PROMPT",
      "specialist_claim_evidence_type_mismatch",
    );
    const inputHash = codexInputHash({
      stage: "memo",
      prompt: corrective,
      outputSchema: SpecialistMemoOutputSchema,
    });

    expect(specialistPromptForDurableInput("BASE PROMPT", inputHash)).toEqual({
      prompt: corrective,
      validationCode: "specialist_claim_evidence_type_mismatch",
    });
  });

  it("replays an exact citation corrective prompt after the authority restarts", () => {
    const root = mkdtempSync(join(tmpdir(), "specialist-repair-prompt-"));
    const databasePath = join(root, "research.sqlite");
    const jobId = "00000000-0000-4000-8000-000000000001";
    const prompt = `BASE PROMPT

CORRECTIVE RETRY — INVALID CITATION IDS
00000000-0000-4000-8000-000000000999

Cite only artifact IDs from this allowlist:
00000000-0000-4000-8000-000000000500`;
    const inputHash = codexInputHash({
      stage: "memo",
      prompt,
      outputSchema: SpecialistMemoOutputSchema,
    });

    try {
      const first = new SpecialistRoundSqliteAuthority(databasePath);
      first.persistRepairPrompt({
        jobId,
        inputHash,
        prompt,
        validationCode: "specialist_claim_evidence_type_mismatch",
        at: "2026-08-27T00:00:00.000Z",
      });
      first.close();

      const recovered = new SpecialistRoundSqliteAuthority(databasePath);
      expect(recovered.repairPromptForInput(jobId, inputHash)).toEqual({
        prompt,
        validationCode: "specialist_claim_evidence_type_mismatch",
      });
      recovered.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
