import { z } from "zod";
import { GroundedAnswerSchema } from "../../domain/question";
import { questionLookupPlan } from "../../domain/questionLookupPlan";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { researchTransaction } from "../persistence/postgres/database";
import {
  type CommandIds,
  type CommandResult,
  type PublicQuestion,
  PublicQuestionSchema,
  type QuestionGrounding,
} from "./researchCommandContracts";
import {
  commandDigest,
  commitCommand,
  replayCommand,
} from "./researchCommandIdempotency";
import type { QuestionCommand } from "./researchCommandInput";

const ReportBindingSchema = z.object({
  report_id: z.string().uuid(),
  version_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  artifact_id: z.string().uuid(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  run_status: z.string(),
});
const QuestionRowSchema = z.object({
  question_id: z.string().uuid(),
  retry_of_question_id: z.string().uuid().nullable(),
  report_id: z.string().uuid(),
  report_version_id: z.string().uuid(),
  attempt_ordinal: z.number().int().min(1).max(20),
  status: z.enum([
    "pending",
    "spawn_reserved",
    "running",
    "answered",
    "failed",
  ]),
  question_json: z.string(),
  answer_json: z.string().nullable(),
  created_at: z.string(),
});
const CountSchema = z.object({ count: z.number().int().nonnegative() });
const ReplaySchema = z.object({ questionId: z.string().uuid() }).strict();

type QuestionContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
  readonly command: QuestionCommand;
  readonly grounding: QuestionGrounding;
};

export async function replayResearchQuestion(
  database: ResearchDatabase,
  reportId: string,
  principalId: string,
  idempotencyKey: string,
  command: QuestionCommand,
): Promise<CommandResult<PublicQuestion> | { readonly kind: "missing" }> {
  const scope = `research-question:${principalId}:${reportId}`;
  const requestHash = commandDigest({ reportId, ...command });
  const replay = await replayCommand(
    database,
    scope,
    idempotencyKey,
    requestHash,
  );
  if (replay.kind === "missing") return replay;
  if (replay.kind === "conflict") return replay;
  const replayed = ReplaySchema.parse(replay.value);
  const value = await findPublicQuestion(
    database,
    principalId,
    replayed.questionId,
  );
  return value === undefined
    ? { kind: "not_found" }
    : { kind: "replayed", value };
}

export function publicQuestionFromRow(input: unknown): PublicQuestion {
  const row = QuestionRowSchema.parse(input);
  const question = z
    .object({ en: z.string(), ko: z.string() })
    .strict()
    .parse(JSON.parse(row.question_json));
  const answer =
    row.answer_json === null
      ? undefined
      : GroundedAnswerSchema.parse(JSON.parse(row.answer_json));
  return PublicQuestionSchema.parse({
    questionId: row.question_id,
    ...(row.retry_of_question_id === null
      ? {}
      : { retryOfQuestionId: row.retry_of_question_id }),
    reportId: row.report_id,
    reportVersionId: row.report_version_id,
    attemptOrdinal: row.attempt_ordinal,
    status: row.status,
    activity:
      questionLookupPlan(question).mode === "external"
        ? "searching"
        : "thinking",
    question,
    ...(answer === undefined ? {} : { answer }),
    createdAt: row.created_at,
  });
}

async function questionRow(
  database: ResearchDatabase,
  principalId: string,
  questionId: string,
): Promise<unknown> {
  return (
    await database.query(
      `SELECT questions.question_id, questions.retry_of_question_id,
      questions.report_id, questions.report_version_id,
      questions.attempt_ordinal, questions.status, questions.question_json,
      questions.answer_json, questions.created_at
      FROM questions JOIN research_requests USING(run_id)
      WHERE questions.question_id = $1 AND research_requests.principal_id = $2`,
      [questionId, principalId],
    )
  ).rows[0];
}

export async function findPublicQuestion(
  database: ResearchDatabase,
  principalId: string,
  questionId: string,
): Promise<PublicQuestion | undefined> {
  const value = await questionRow(database, principalId, questionId);
  return value === undefined ? undefined : publicQuestionFromRow(value);
}

export async function listPublicQuestions(
  database: ResearchDatabase,
  principalId: string,
  reportId: string,
): Promise<readonly PublicQuestion[]> {
  return (
    await database.query(
      `SELECT questions.question_id, questions.retry_of_question_id,
      questions.report_id, questions.report_version_id,
      questions.attempt_ordinal, questions.status, questions.question_json,
      questions.answer_json, questions.created_at
      FROM questions JOIN research_requests USING(run_id)
      WHERE questions.report_id = $1 AND research_requests.principal_id = $2
      ORDER BY questions.attempt_ordinal ASC`,
      [reportId, principalId],
    )
  ).rows.map(publicQuestionFromRow);
}

export async function createResearchQuestion(
  database: ResearchDatabase,
  reportId: string,
  context: QuestionContext,
): Promise<CommandResult<PublicQuestion>> {
  return await researchTransaction(
    database,
    async (transaction): Promise<CommandResult<PublicQuestion>> => {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtext('research-admission'))",
      );
      const scope = `research-question:${context.principalId}:${reportId}`;
      const requestHash = commandDigest({ reportId, ...context.command });
      const replay = await replayResearchQuestion(
        transaction,
        reportId,
        context.principalId,
        context.idempotencyKey,
        context.command,
      );
      if (replay.kind !== "missing") return replay;
      const bindingValue = (
        await transaction.query(
          `SELECT reports.report_id, report_versions.version_id,
        report_versions.run_id, report_versions.snapshot_id,
        report_versions.artifact_id, artifacts.content_hash,
        runs.status AS run_status
        FROM reports JOIN report_versions USING(report_id)
        JOIN artifacts USING(artifact_id)
        JOIN runs ON runs.run_id = report_versions.run_id
        JOIN research_requests ON research_requests.run_id = reports.run_id
        WHERE reports.report_id = $1 AND reports.state = 'published'
          AND research_requests.principal_id = $2
        ORDER BY report_versions.version DESC LIMIT 1`,
          [reportId, context.principalId],
        )
      ).rows[0];
      if (bindingValue === undefined) return { kind: "not_found" };
      const binding = ReportBindingSchema.parse(bindingValue);
      if (
        binding.run_status !== "completed" &&
        binding.run_status !== "complete-with-limitations"
      )
        return { kind: "illegal_state" };
      if (
        binding.version_id !== context.grounding.reportVersionId ||
        binding.content_hash !== context.grounding.reportArtifactDigest
      )
        return { kind: "illegal_state" };
      const active = CountSchema.parse(
        (
          await transaction.query(
            `SELECT CAST(COUNT(*) AS integer) AS count FROM questions WHERE report_id = $1
          AND status IN ('pending', 'spawn_reserved', 'running')`,
            [reportId],
          )
        ).rows[0],
      ).count;
      if (active > 0) return { kind: "active_question" };
      const used = CountSchema.parse(
        (
          await transaction.query(
            "SELECT CAST(COUNT(*) AS integer) AS count FROM questions WHERE report_id = $1",
            [reportId],
          )
        ).rows[0],
      ).count;
      if (used >= 20) return { kind: "quota_exhausted" };
      if (context.command.retryOfQuestionId !== undefined) {
        const retry = (
          await transaction.query(
            `SELECT status FROM questions
          WHERE question_id = $1 AND report_id = $2`,
            [context.command.retryOfQuestionId, reportId],
          )
        ).rows[0];
        const parsed = z.object({ status: z.string() }).safeParse(retry);
        if (!parsed.success || parsed.data.status !== "failed")
          return { kind: "illegal_state" };
      }
      const attemptOrdinal = used + 1;
      const localized = context.grounding.question;
      const inputHash = context.grounding.inputHash;
      await transaction.query(
        `INSERT INTO jobs(job_id, run_id, snapshot_id, kind,
        logical_key, input_hash, status, created_at) VALUES ($1, $2, $3, 'qa', $4, $5,
        'queued', $6)`,
        [
          context.ids.jobId,
          binding.run_id,
          binding.snapshot_id,
          `question:${context.ids.questionId}`,
          inputHash,
          context.now,
        ],
      );
      await transaction.query(
        `INSERT INTO questions(question_id, retry_of_question_id,
        report_id, report_version_id, run_id, snapshot_id, job_id,
        attempt_ordinal, status, question_json, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)`,
        [
          context.ids.questionId,
          context.command.retryOfQuestionId ?? null,
          reportId,
          binding.version_id,
          binding.run_id,
          binding.snapshot_id,
          context.ids.jobId,
          attemptOrdinal,
          JSON.stringify(localized),
          context.now,
        ],
      );
      const created = await findPublicQuestion(
        transaction,
        context.principalId,
        context.ids.questionId,
      );
      if (created === undefined) return { kind: "not_found" };
      await commitCommand(transaction, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value: { questionId: context.ids.questionId },
        now: context.now,
      });
      return { kind: "created", value: created };
    },
  );
}
