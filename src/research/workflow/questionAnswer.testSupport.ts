import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ArtifactIdSchema, EventIdSchema, JobIdSchema } from "../domain/ids";
import {
  type ResearchReport,
  ResearchReportSchema,
  type WorkflowV2ResearchReport,
  type WorkflowV3ResearchReport,
} from "../domain/report";
import { reportTestIds, validReport } from "../domain/report.testSupport";
import { StrictArtifactCasFake } from "../ports/test/serviceFakes";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import { CodexRunnerError } from "../server/codex/codexRunner";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { questionInputHash } from "../server/qa/questionAnswerContracts";

const ids = {
  job: JobIdSchema.parse("00000000-0000-4000-8000-000000000101"),
  question: "00000000-0000-4000-8000-000000000102",
  artifact: ArtifactIdSchema.parse("00000000-0000-4000-8000-000000000103"),
  event: EventIdSchema.parse("00000000-0000-4000-8000-000000000104"),
} as const;
const now = "2026-07-23T00:00:00.000Z";

export type QuestionCodexMode =
  | "api_alias"
  | "external"
  | "grounded"
  | "timeout"
  | "unknown_claim";

export class QuestionCodexFake implements CodexPort {
  readonly id = "isolated-codex-cli" as const;
  readonly kind = "real" as const;
  launches = 0;
  readonly prompts: string[] = [];
  readonly runtimeOverrides: CodexRunInput<unknown>["runtime"][] = [];

  constructor(private readonly mode: QuestionCodexMode = "grounded") {}

  async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    this.launches += 1;
    this.prompts.push(input.prompt);
    this.runtimeOverrides.push(input.runtime);
    if (this.mode === "timeout") throw new CodexRunnerError("timeout");
    if (this.mode === "api_alias")
      return {
        candidate: input.outputSchema.parse({
          claimIds: [],
          externalUrls: ["https://finance.yahoo.com/quote/MSFT/"],
          answer: {
            en: "The licensed quote supplies the current market price.",
            ko: "라이선스 시세가 현재 주가를 제공합니다.",
          },
        }),
        evidence: {
          ordinal: input.reservation.key.ordinal,
          stage: "qa",
          model: input.runtime?.model ?? "gpt-5.6-terra",
          reasoning: input.runtime?.reasoning ?? "low",
          browsingPolicy: "audited_web",
          toolTranscriptHash:
            "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
          binaryVersion: "codex-test 1",
          binaryHash: "a".repeat(64),
          originDevice: "1",
          originInode: "2",
          linkDevice: "1",
          linkInode: "2",
          profileHash: "b".repeat(64),
          environmentHash: "c".repeat(64),
          argvHash: "d".repeat(64),
          schemaHash: "e".repeat(64),
          eventTypes: ["thread.started", "turn.completed"],
          exitCode: 0,
          toolEventCount: 0,
          cleanup: "complete",
        },
      };
    if (this.mode === "external") {
      const content = new TextEncoder().encode("captured current source");
      const url = "https://example.com/latest-company-update";
      const artifactId = "00000000-0000-4000-8000-000000000188";
      await input.captureWebEvidence?.({
        reservation: input.reservation,
        transcriptHash:
          "4fb2c6dc3ea82195e850899a61a6eabce8b8b3a90451a70b20cb5bc222682221",
        artifacts: [
          {
            artifactId,
            url,
            title: "Latest company update",
            publisher: "Example Exchange",
            retrievedAt: now,
            excerpt: "The company published a current operating update.",
            contentHash:
              "4eb4549ed652f4e9a291bfca52af19b52c05d6d2824b615de905cba7021aa195",
            content,
          },
        ],
      });
      return {
        candidate: input.outputSchema.parse({
          claimIds: [],
          externalUrls: [url],
          answer: {
            en: "The latest operating update adds current evidence.",
            ko: "최신 운영 업데이트가 현재 근거를 보강합니다.",
          },
        }),
        evidence: {
          ordinal: input.reservation.key.ordinal,
          stage: "qa",
          model: "gpt-5.6-terra",
          reasoning: "low",
          browsingPolicy: "audited_web",
          toolTranscriptHash:
            "4fb2c6dc3ea82195e850899a61a6eabce8b8b3a90451a70b20cb5bc222682221",
          binaryVersion: "codex-test 1",
          binaryHash: "a".repeat(64),
          originDevice: "1",
          originInode: "2",
          linkDevice: "1",
          linkInode: "2",
          profileHash: "b".repeat(64),
          environmentHash: "c".repeat(64),
          argvHash: "d".repeat(64),
          schemaHash: "e".repeat(64),
          eventTypes: ["thread.started", "item.completed", "turn.completed"],
          exitCode: 0,
          toolEventCount: 2,
          cleanup: "complete",
        },
      };
    }
    const claimId =
      this.mode === "grounded"
        ? reportTestIds.claim
        : "00000000-0000-4000-8000-000000000199";
    return {
      candidate: input.outputSchema.parse({
        claimIds: [claimId],
        externalUrls: [],
        answer: {
          en: "The selected published claim directly answers the question.",
          ko: "선택된 공개 근거가 질문에 직접 답합니다.",
        },
      }),
      evidence: {
        ordinal: input.reservation.key.ordinal,
        stage: "qa",
        model: "gpt-5.6-terra",
        reasoning: "low",
        browsingPolicy: "audited_web",
        toolTranscriptHash:
          "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
        binaryVersion: "codex-test 1",
        binaryHash: "a".repeat(64),
        originDevice: "1",
        originInode: "2",
        linkDevice: "1",
        linkInode: "2",
        profileHash: "b".repeat(64),
        environmentHash: "c".repeat(64),
        argvHash: "d".repeat(64),
        schemaHash: "e".repeat(64),
        eventTypes: ["thread.started", "turn.completed"],
        exitCode: 0,
        toolEventCount: 0,
        cleanup: "complete",
      },
    };
  }
}

export async function createQuestionAnswerFixture(
  options: {
    readonly advancedQuestion?: boolean;
    readonly codex?: QuestionCodexFake;
    readonly externalQuestion?: boolean;
    readonly marketApiEvidence?: boolean;
    readonly reportIdMismatch?: boolean;
    readonly report?:
      | ResearchReport
      | WorkflowV2ResearchReport
      | WorkflowV3ResearchReport;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "stocksembly-question-answer-"));
  const databasePath = join(root, "workflow.sqlite");
  const cas = new StrictArtifactCasFake();
  const report = options.report ?? ResearchReportSchema.parse(validReport());
  const specialistQuestion = {
    kind: "specialist_consultation_v1",
    evidenceScope: "intent_routed",
    responseStyle: "professional",
    advancedReasoning: options.advancedQuestion === true,
    specialist: {
      name: { en: "Chair", ko: "의장" },
      role: { en: "Research chair", ko: "리서치 의장" },
      specialty: { en: "Evidence", ko: "근거" },
    },
    userQuestion: {
      en:
        options.externalQuestion || options.marketApiEvidence
          ? "What is the latest company update since this report?"
          : "Did the filing support a new price target?",
      ko:
        options.externalQuestion || options.marketApiEvidence
          ? "이 리포트 이후 최신 회사 업데이트가 뭐야?"
          : "공시가 새로운 목표주가를 뒷받침했나요?",
    },
    ...(options.marketApiEvidence === true
      ? {
          externalApiEvidence: [
            {
              url: "https://licensed.example.test/v3/quotes/MSFT",
              title: "MSFT current market quote",
              publisher: "Licensed market data",
              retrievedAt: now,
              excerpt: '{"lastPrice":391.18,"currency":"USD"}',
            },
          ],
        }
      : {}),
  } as const;
  const question =
    options.externalQuestion ||
    options.advancedQuestion ||
    options.marketApiEvidence
      ? {
          en: JSON.stringify(specialistQuestion),
          ko: JSON.stringify(specialistQuestion),
        }
      : {
          en: "Did the filing support a new price target?",
          ko: "공시가 새로운 목표주가를 뒷받침했나요?",
        };
  const inputHash = questionInputHash(report, ids.question, question);
  const store = openSqliteStore(databasePath);
  store.createRun({
    runId: report.runId,
    snapshotId: report.snapshotId,
    requestedAt: now,
    initialJob: {
      jobId: ids.job,
      kind: "qa",
      logicalKey: `question:${ids.question}`,
      inputHash,
      createdAt: now,
    },
    initialEvent: {
      eventId: ids.event,
      type: "question_queued",
      stateId: "queued",
      occurredAt: now,
    },
  });
  store.close();
  const storedReport = options.reportIdMismatch
    ? { ...report, reportId: "00000000-0000-4000-8000-000000000198" }
    : report;
  const bytes = new TextEncoder().encode(JSON.stringify(storedReport));
  const descriptor = await cas.put({
    artifactId: ids.artifact,
    runId: report.runId,
    snapshotId: report.snapshotId,
    mediaType: "application/json",
    parentDigests: [],
    bytes,
  });
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database
    .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
      content_hash, byte_length, media_type, logical_key, input_hash, created_at)
      VALUES (?, ?, ?, ?, ?, 'application/json', 'report:published', ?, ?)`)
    .run(
      ids.artifact,
      report.runId,
      report.snapshotId,
      descriptor.digest,
      descriptor.byteLength,
      "f".repeat(64),
      now,
    );
  database
    .prepare(`INSERT INTO reports(report_id, run_id, snapshot_id, state, created_at)
      VALUES (?, ?, ?, 'published', ?)`)
    .run(report.reportId, report.runId, report.snapshotId, now);
  database
    .prepare(`INSERT INTO report_versions(version_id, report_id, run_id,
      snapshot_id, version, artifact_id, status, published_at, public_payload_json)
      VALUES (?, ?, ?, ?, 1, ?, 'complete_with_limitations', ?, '{}')`)
    .run(
      report.versionId,
      report.reportId,
      report.runId,
      report.snapshotId,
      ids.artifact,
      now,
    );
  database
    .prepare(`INSERT INTO questions(question_id, report_id, report_version_id,
      run_id, snapshot_id, job_id, attempt_ordinal, status, question_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)`)
    .run(
      ids.question,
      report.reportId,
      report.versionId,
      report.runId,
      report.snapshotId,
      ids.job,
      JSON.stringify(question),
      now,
    );
  database.close();
  return {
    root,
    databasePath,
    cas,
    codex: options.codex ?? new QuestionCodexFake(),
    questionId: ids.question,
    report: report as ResearchReport,
    now: () => now,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
