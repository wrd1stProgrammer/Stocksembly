import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexInputHash } from "../server/codex/codexReservation";
import { workflowTestDatabase } from "./postgresDatabase.testSupport";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";
import { specialistPromptForDurableInput } from "./specialistRoundPostgresHandler";

describe("durable specialist repair prompt", () => {
  it("retains citation exhaustion when resuming a previously failed job", () => {
    const prompt = "original prompt";
    const inputHash = codexInputHash({
      stage: "memo",
      prompt,
      outputSchema: SpecialistMemoOutputSchema,
    });
    expect(
      specialistPromptForDurableInput(
        prompt,
        inputHash,
        "specialist_citation_invalid_after_retry",
      ),
    ).toEqual({
      prompt,
      validationCode: "specialist_citation_invalid_after_retry",
    });
  });
  it("replays an exact citation corrective prompt after the authority restarts", async () => {
    const root = mkdtempSync(join(tmpdir(), "specialist-repair-prompt-"));
    const database = await workflowTestDatabase();
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
      const first = new SpecialistRoundPostgresAuthority(database);
      await first.persistRepairPrompt({
        jobId,
        inputHash,
        prompt,
        validationCode: "specialist_claim_evidence_type_mismatch",
        at: "2026-08-27T00:00:00.000Z",
      });
      first.close();

      const recovered = new SpecialistRoundPostgresAuthority(database);
      expect(await recovered.repairPromptForInput(jobId, inputHash)).toEqual({
        prompt,
        validationCode: "specialist_claim_evidence_type_mismatch",
      });
      recovered.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
