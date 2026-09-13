import type { ResearchDatabase } from "../persistence/postgres/database";
import { cancelResearchRun } from "./researchCancellationCommand";
import type {
  CancelledRun,
  ChildRun,
  CommandIds,
  CommandResult,
  PublicQuestion,
  QuestionGrounding,
  RecoveredRun,
} from "./researchCommandContracts";
import type { FollowUpCommand, QuestionCommand } from "./researchCommandInput";
import { createResearchFollowUp } from "./researchFollowUpCommand";
import {
  createResearchQuestion,
  findPublicQuestion,
  listPublicQuestions,
  replayResearchQuestion,
} from "./researchQuestionCommands";
import {
  replayResearchRunRetry,
  retryResearchRun,
} from "./researchRunCommands";

export type ResearchCommandRepositoryOptions = {
  readonly database: ResearchDatabase;
};
type BaseContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

export class ResearchCommandRepository {
  readonly #database: ResearchDatabase;

  constructor(options: ResearchCommandRepositoryOptions) {
    this.#database = options.database;
  }

  async cancel(
    runId: string,
    context: BaseContext,
  ): Promise<CommandResult<CancelledRun>> {
    return await cancelResearchRun(this.#database, runId, context);
  }

  async retry(
    runId: string,
    context: BaseContext,
  ): Promise<CommandResult<RecoveredRun>> {
    return await retryResearchRun(this.#database, runId, context);
  }

  async replayRetry(
    runId: string,
    principalId: string,
    idempotencyKey: string,
  ) {
    return await replayResearchRunRetry(
      this.#database,
      runId,
      principalId,
      idempotencyKey,
    );
  }

  async followUp(
    reportId: string,
    command: FollowUpCommand,
    context: BaseContext,
  ): Promise<CommandResult<ChildRun>> {
    return await createResearchFollowUp(this.#database, reportId, {
      ...context,
      ...(command.question === undefined ? {} : { question: command.question }),
    });
  }

  async createQuestion(
    reportId: string,
    command: QuestionCommand,
    grounding: QuestionGrounding,
    context: BaseContext,
  ): Promise<CommandResult<PublicQuestion>> {
    return await createResearchQuestion(this.#database, reportId, {
      ...context,
      command,
      grounding,
    });
  }

  async replayQuestion(
    reportId: string,
    command: QuestionCommand,
    context: Pick<BaseContext, "principalId" | "idempotencyKey">,
  ) {
    return await replayResearchQuestion(
      this.#database,
      reportId,
      context.principalId,
      context.idempotencyKey,
      command,
    );
  }

  async question(
    principalId: string,
    questionId: string,
  ): Promise<PublicQuestion | undefined> {
    return await findPublicQuestion(this.#database, principalId, questionId);
  }

  async questions(
    principalId: string,
    reportId: string,
  ): Promise<readonly PublicQuestion[]> {
    return await listPublicQuestions(this.#database, principalId, reportId);
  }

  close(): void {
    // The process owns the shared pool.
  }
}
