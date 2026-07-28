import Database from "better-sqlite3";
import { applyOrderedMigrations } from "../persistence/sqlite/migrations";
import { cancelResearchRun } from "./researchCancellationCommand";
import type {
  CancelledRun,
  ChildRun,
  CommandIds,
  CommandResult,
  PublicQuestion,
  QuestionGrounding,
} from "./researchCommandContracts";
import type { FollowUpCommand, QuestionCommand } from "./researchCommandInput";
import { createResearchFollowUp } from "./researchFollowUpCommand";
import {
  createResearchQuestion,
  findPublicQuestion,
  listPublicQuestions,
  replayResearchQuestion,
} from "./researchQuestionCommands";
import { retryResearchRun } from "./researchRunCommands";

export type ResearchCommandRepositoryOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
};
type BaseContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

export class ResearchCommandRepository {
  readonly #database: Database.Database;

  constructor(options: ResearchCommandRepositoryOptions) {
    this.#database = new Database(options.databasePath, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  cancel(runId: string, context: BaseContext): CommandResult<CancelledRun> {
    return cancelResearchRun(this.#database, runId, context);
  }

  retry(runId: string, context: BaseContext): CommandResult<ChildRun> {
    return retryResearchRun(this.#database, runId, context);
  }

  followUp(
    reportId: string,
    command: FollowUpCommand,
    context: BaseContext,
  ): CommandResult<ChildRun> {
    return createResearchFollowUp(this.#database, reportId, {
      ...context,
      ...(command.question === undefined ? {} : { question: command.question }),
    });
  }

  createQuestion(
    reportId: string,
    command: QuestionCommand,
    grounding: QuestionGrounding,
    context: BaseContext,
  ): CommandResult<PublicQuestion> {
    return createResearchQuestion(this.#database, reportId, {
      ...context,
      command,
      grounding,
    });
  }

  replayQuestion(
    reportId: string,
    command: QuestionCommand,
    context: Pick<BaseContext, "principalId" | "idempotencyKey">,
  ) {
    return replayResearchQuestion(
      this.#database,
      reportId,
      context.principalId,
      context.idempotencyKey,
      command,
    );
  }

  question(
    principalId: string,
    questionId: string,
  ): PublicQuestion | undefined {
    return findPublicQuestion(this.#database, principalId, questionId);
  }

  questions(principalId: string, reportId: string): readonly PublicQuestion[] {
    return listPublicQuestions(this.#database, principalId, reportId);
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}
