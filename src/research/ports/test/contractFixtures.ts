import {
  ArtifactIdSchema,
  AttemptIdSchema,
  ReportIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
  TickerSymbolSchema,
} from "../../domain/ids";
import { JobRecordSchema } from "../../domain/jobStateContracts";
import {
  PublicResearchEventSchema,
  ReportHistorySchema,
} from "../../domain/publicEvent";
import { PersistedQuestionSchema } from "../../domain/question";
import { RunRecordSchema } from "../../domain/runStateContracts";

export const contractIds = {
  runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  snapshotId: SnapshotIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  artifactId: ArtifactIdSchema.parse("00000000-0000-4000-8000-000000000003"),
  attemptId: AttemptIdSchema.parse("00000000-0000-4000-8000-000000000004"),
  reportId: ReportIdSchema.parse("00000000-0000-4000-8000-000000000005"),
  ticker: TickerSymbolSchema.parse("NVDA"),
} as const;

const timestamp = "2026-07-22T00:00:00.000Z";

export const contractRun = RunRecordSchema.parse({
  runId: contractIds.runId,
  snapshotId: contractIds.snapshotId,
  status: "queued",
  createdAt: timestamp,
  eventSeq: 0,
});

export const contractJob = JobRecordSchema.parse({
  jobId: "00000000-0000-4000-8000-000000000006",
  runId: contractIds.runId,
  snapshotId: contractIds.snapshotId,
  kind: "research",
  logicalKey: "memo:market",
  status: "queued",
  createdAt: timestamp,
});

export const contractEvent = PublicResearchEventSchema.parse({
  schemaVersion: "workflow-v1",
  eventId: "00000000-0000-4000-8000-000000000007",
  runId: contractIds.runId,
  snapshotId: contractIds.snapshotId,
  sequence: 1,
  kind: "artifact_committed",
  artifactId: contractIds.artifactId,
  actorId: "market",
  stage: "memo",
  artifact: {
    artifactId: contractIds.artifactId,
    logicalArtifactId: "memo:market",
    roleId: "market",
    stage: "memo",
    status: "accepted",
    runId: contractIds.runId,
    snapshotId: contractIds.snapshotId,
  },
  summary: { en: "Memo committed.", ko: "메모가 확정되었습니다." },
  detail: { en: "Evidence accepted.", ko: "근거가 승인되었습니다." },
  stateId: "memo-accepted",
  occurredAt: timestamp,
});

const versionId = "00000000-0000-4000-8000-000000000008";
export const contractHistory = ReportHistorySchema.parse({
  reportId: contractIds.reportId,
  currentVersionId: versionId,
  versions: [
    {
      reportId: contractIds.reportId,
      versionId,
      runId: contractIds.runId,
      snapshotId: contractIds.snapshotId,
      version: 1,
      status: "complete_with_limitations",
      publishedAt: timestamp,
      title: { en: "Research File", ko: "리서치 파일" },
    },
  ],
});

export const contractQuestion = PersistedQuestionSchema.parse({
  schemaVersion: "workflow-v1",
  questionId: "00000000-0000-4000-8000-000000000009",
  reportId: contractIds.reportId,
  reportVersionId: versionId,
  runId: contractIds.runId,
  snapshotId: contractIds.snapshotId,
  attemptOrdinal: 1,
  status: "pending",
  question: { en: "What changed?", ko: "무엇이 바뀌었나요?" },
});
