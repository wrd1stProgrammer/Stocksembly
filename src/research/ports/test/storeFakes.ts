import type { JobId, QuestionId, ReportId, RunId } from "../../domain/ids";
import type { JobRecordData } from "../../domain/jobStateContracts";
import type {
  PublicResearchEvent,
  ReportHistory,
} from "../../domain/publicEvent";
import type { PersistedQuestion } from "../../domain/question";
import type { RunRecordData } from "../../domain/runStateContracts";
import type {
  ResearchTransactionPort,
  TransactionalResearchStorePort,
} from "../stores";

type StoreState = {
  readonly runs: Map<RunId, RunRecordData>;
  readonly jobs: Map<JobId, JobRecordData>;
  readonly events: Map<RunId, PublicResearchEvent[]>;
  readonly histories: Map<ReportId, ReportHistory>;
  readonly questions: Map<QuestionId, PersistedQuestion>;
};

function emptyState(): StoreState {
  return {
    runs: new Map(),
    jobs: new Map(),
    events: new Map(),
    histories: new Map(),
    questions: new Map(),
  };
}

function cloneState(state: StoreState): StoreState {
  return {
    runs: new Map(state.runs),
    jobs: new Map(state.jobs),
    events: new Map(
      [...state.events].map(([runId, events]) => [runId, [...events]]),
    ),
    histories: new Map(state.histories),
    questions: new Map(state.questions),
  };
}

class StrictStoreTransaction implements ResearchTransactionPort {
  constructor(private readonly state: StoreState) {}

  async findRun(runId: RunId): Promise<RunRecordData | undefined> {
    return this.state.runs.get(runId);
  }

  async saveRun(run: RunRecordData): Promise<void> {
    this.state.runs.set(run.runId, run);
  }

  async findJob(jobId: JobId): Promise<JobRecordData | undefined> {
    return this.state.jobs.get(jobId);
  }

  async saveJob(job: JobRecordData): Promise<void> {
    this.state.jobs.set(job.jobId, job);
  }

  async appendEvent(event: PublicResearchEvent): Promise<void> {
    const events = this.state.events.get(event.runId) ?? [];
    const expectedSequence = events.length + 1;
    if (event.sequence !== expectedSequence) {
      throw new RangeError(`expected event sequence ${expectedSequence}`);
    }
    events.push(event);
    this.state.events.set(event.runId, events);
  }

  async eventsAfter(
    runId: RunId,
    sequence: number,
  ): Promise<readonly PublicResearchEvent[]> {
    return (this.state.events.get(runId) ?? []).filter(
      (event) => event.sequence > sequence,
    );
  }

  async findHistory(reportId: ReportId): Promise<ReportHistory | undefined> {
    return this.state.histories.get(reportId);
  }

  async saveHistory(history: ReportHistory): Promise<void> {
    this.state.histories.set(history.reportId, history);
  }

  async findQuestion(
    questionId: QuestionId,
  ): Promise<PersistedQuestion | undefined> {
    return this.state.questions.get(questionId);
  }

  async saveQuestion(question: PersistedQuestion): Promise<void> {
    this.state.questions.set(question.questionId, question);
  }
}

export class StrictTransactionalStoreFake
  implements TransactionalResearchStorePort
{
  private state = emptyState();

  async transaction<Result>(
    operation: (stores: ResearchTransactionPort) => Promise<Result>,
  ): Promise<Result> {
    const staged = cloneState(this.state);
    const result = await operation(new StrictStoreTransaction(staged));
    this.state = staged;
    return result;
  }
}
