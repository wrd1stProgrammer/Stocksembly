import type { JobId, QuestionId, ReportId, RunId } from "../domain/ids";
import type { JobRecordData } from "../domain/jobStateContracts";
import type { PublicResearchEvent, ReportHistory } from "../domain/publicEvent";
import type { PersistedQuestion } from "../domain/question";
import type { RunRecordData } from "../domain/runStateContracts";

export interface ResearchRecordStorePort {
  readonly findRun: (runId: RunId) => Promise<RunRecordData | undefined>;
  readonly saveRun: (run: RunRecordData) => Promise<void>;
}

export interface JobStorePort {
  readonly findJob: (jobId: JobId) => Promise<JobRecordData | undefined>;
  readonly saveJob: (job: JobRecordData) => Promise<void>;
}

export interface EventStorePort {
  readonly appendEvent: (event: PublicResearchEvent) => Promise<void>;
  readonly eventsAfter: (
    runId: RunId,
    sequence: number,
  ) => Promise<readonly PublicResearchEvent[]>;
}

export interface HistoryStorePort {
  readonly findHistory: (
    reportId: ReportId,
  ) => Promise<ReportHistory | undefined>;
  readonly saveHistory: (history: ReportHistory) => Promise<void>;
}

export interface QuestionStorePort {
  readonly findQuestion: (
    questionId: QuestionId,
  ) => Promise<PersistedQuestion | undefined>;
  readonly saveQuestion: (question: PersistedQuestion) => Promise<void>;
}

export type ResearchTransactionPort = ResearchRecordStorePort &
  JobStorePort &
  EventStorePort &
  HistoryStorePort &
  QuestionStorePort;

export interface TransactionalResearchStorePort {
  readonly transaction: <Result>(
    operation: (stores: ResearchTransactionPort) => Promise<Result>,
  ) => Promise<Result>;
}
