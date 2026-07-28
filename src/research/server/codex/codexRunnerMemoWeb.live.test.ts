import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { commitAgentOutput } from "../../application/commitAgentOutput";
import { MemoOutputSchema } from "../../domain/agentOutputs";
import { hashCanonical } from "../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../../domain/ids";
import { recordSuccessfulRunnerEvidence } from "../../workflow/agentRunnerLaunchEvidence";
import { CodexRunnerError } from "./codexErrors";
import { productionCodexPlatform } from "./codexPlatform";
import { createCodexPortForTesting } from "./codexRunner";
import {
  LiveMemoWebVerificationError,
  prepareLiveMemoWebFixture,
} from "./codexRunnerMemoWeb.live.testSupport";
import { captureAttemptWebEvidence } from "./codexWebCapture";

const LIVE = Reflect.get(process.env, "STOCKSEMBLY_LIVE_MEMO_WEB") === "1";
const EVIDENCE_PATH = join(
  process.cwd(),
  ".omo/evidence/start-work/insightsentry/task-8/live-memo-web.json",
);
const CountSchema = z.object({ count: z.number().int().nonnegative() });
const ArtifactRowSchema = z.object({ artifact_id: ArtifactIdSchema });

type LiveOutcome = {
  readonly scenario: string;
  readonly status: string;
  readonly failureClass?: string;
  readonly toolEventCount?: number;
  readonly capturedArtifactCount?: number;
  readonly transcriptHash?: string;
  readonly eventTypes?: readonly string[];
  readonly providerCallReached?: boolean;
  readonly toolEventCountObserved?: number;
  readonly capturedArtifactCountObserved?: number;
  readonly citationCommitReached?: boolean;
};

describe("live audited memo web path", () => {
  it.runIf(LIVE)(
    "records one real hosted web-search event through CAS, ledger, and citation commit",
    async () => {
      // Given
      vi.stubEnv("LANG", "en_US.UTF-8");
      vi.stubEnv("LC_ALL", "en_US.UTF-8");
      const fixture = await prepareLiveMemoWebFixture();
      const port = createCodexPortForTesting(
        productionCodexPlatform(),
        fixture.reservations,
      );
      let outcome: LiveOutcome = {
        scenario: "single authorized memo-stage live-path attempt",
        status: "started",
      };
      let caught: unknown;

      try {
        // When
        const result = await port.run({
          attemptDir: fixture.attemptDir,
          reservation: fixture.claim,
          stage: "memo",
          prompt: fixture.prompt,
          outputSchema: MemoOutputSchema,
          captureWebEvidence: async (capture) =>
            await captureAttemptWebEvidence(
              fixture.cas,
              fixture.commitStore,
              fixture.snapshotId,
              "2026-07-24T00:00:04.000Z",
              capture,
            ),
        });
        const recorded = recordSuccessfulRunnerEvidence(
          fixture.commitStore,
          {
            runId: fixture.runId,
            jobId: fixture.jobId,
            attemptId: fixture.attemptId,
            ordinal: fixture.reserved.ordinal,
            ownerId: fixture.leased.ownerId,
            token: fixture.leased.leaseToken,
            now: "2026-07-24T00:00:05.000Z",
            stage: "memo",
            promptHash: hashCanonical(fixture.prompt),
            inputHash: fixture.inputHash,
          },
          result.evidence,
        );
        const inspection = new Database(fixture.databasePath, {
          readonly: true,
        });
        const ledgerCount = CountSchema.parse(
          inspection
            .prepare(
              "SELECT COUNT(*) AS count FROM attempt_web_evidence WHERE attempt_id = ?",
            )
            .get(fixture.attemptId),
        ).count;
        const row = ArtifactRowSchema.safeParse(
          inspection
            .prepare(
              "SELECT artifact_id FROM attempt_web_evidence WHERE attempt_id = ? ORDER BY artifact_id LIMIT 1",
            )
            .get(fixture.attemptId),
        );
        inspection.close();
        if (!recorded)
          throw new LiveMemoWebVerificationError("runner_evidence_rejected");
        if (!row.success)
          throw new LiveMemoWebVerificationError(
            "web_event_without_capturable_artifact",
          );
        const candidate = MemoOutputSchema.parse({
          ...result.candidate,
          sourceArtifactIds: [row.data.artifact_id],
          positions: result.candidate.positions.map((position) => ({
            ...position,
            evidenceArtifactIds: [row.data.artifact_id],
          })),
        });
        const committed = await commitAgentOutput(
          { cas: fixture.cas, store: fixture.commitStore },
          {
            claim: fixture.claim,
            stage: "memo",
            candidate,
            artifactId: ArtifactIdSchema.parse(randomUUID()),
            eventId: EventIdSchema.parse(randomUUID()),
            replacementAttemptId: AttemptIdSchema.parse(randomUUID()),
            replacementEventId: EventIdSchema.parse(randomUUID()),
            occurredAt: "2026-07-24T00:00:06.000Z",
          },
        );
        outcome = {
          scenario: "single authorized memo-stage live-path attempt",
          status: committed.kind,
          providerCallReached: true,
          toolEventCount: result.evidence.toolEventCount,
          capturedArtifactCount: ledgerCount,
          transcriptHash: result.evidence.toolTranscriptHash,
          eventTypes: result.evidence.eventTypes,
          citationCommitReached: committed.kind === "committed",
        };
        if (committed.kind !== "committed")
          throw new LiveMemoWebVerificationError(
            `citation_commit_${committed.kind}`,
          );
      } catch (error) {
        caught = error;
        outcome = {
          scenario: "single authorized memo-stage live-path attempt",
          status: "failed",
          failureClass:
            error instanceof CodexRunnerError
              ? error.code
              : error instanceof LiveMemoWebVerificationError
                ? error.reason
                : error instanceof Error
                  ? error.name
                  : "non_error_failure",
        };
      } finally {
        fixture.commitStore.close();
        await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
        await writeFile(
          EVIDENCE_PATH,
          `${JSON.stringify(outcome, null, 2)}\n`,
          {
            encoding: "utf8",
            mode: 0o600,
          },
        );
        vi.unstubAllEnvs();
        await rm(fixture.root, { recursive: true, force: true });
      }

      // Then
      if (caught !== undefined) throw caught;
      expect(outcome.status).toBe("committed");
    },
    12 * 60_000,
  );
});
