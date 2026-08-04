import type Database from "better-sqlite3";
import { z } from "zod";
import { GroundedAnswerSchema } from "../../domain/question";
import { questionLookupPlan } from "../../domain/questionLookupPlan";
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

export function replayResearchQuestion(
  database: Database.Database,
  reportId: string,
  principalId: string,
  idempotencyKey: string,
  command: QuestionCommand,
): CommandResult<PublicQuestion> | { readonly kind: "missing" } {
  const scope = `research-question:${principalId}:${reportId}`;
  const requestHash = commandDigest({ reportId, ...command });
  const replay = replayCommand(database, scope, idempotencyKey, requestHash);
  if (replay.kind === "missing") return replay;
  if (replay.kind === "conflict") return replay;
  const replayed = ReplaySchema.parse(replay.value);
  const value = findPublicQuestion(database, principalId, replayed.questionId);
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

function questionRow(
  database: Database.Database,
  principalId: string,
  questionId: string,
): unknown {
  return database
    .prepare(`SELECT questions.question_id, questions.retry_of_question_id,
      questions.report_id, questions.report_version_id,
      questions.attempt_ordinal, questions.status, questions.question_json,
      questions.answer_json, questions.created_at
      FROM questions JOIN research_requests USING(run_id)
      WHERE questions.question_id = ? AND research_requests.principal_id = ?`)
    .get(questionId, principalId);
}

export function findPublicQuestion(
  database: Database.Database,
  principalId: string,
  questionId: string,
): PublicQuestion | undefined {
  const value = questionRow(database, principalId, questionId);
  return value === undefined ? undefined : publicQuestionFromRow(value);
}

export function listPublicQuestions(
  database: Database.Database,
  principalId: string,
  reportId: string,
): readonly PublicQuestion[] {
  return database
    .prepare(`SELECT questions.question_id, questions.retry_of_question_id,
      questions.report_id, questions.report_version_id,
      questions.attempt_ordinal, questions.status, questions.question_json,
      questions.answer_json, questions.created_at
      FROM questions JOIN research_requests USING(run_id)
      WHERE questions.report_id = ? AND research_requests.principal_id = ?
      ORDER BY questions.attempt_ordinal ASC`)
    .all(reportId, principalId)
    .map(publicQuestionFromRow);
}

export function createResearchQuestion(
  database: Database.Database,
  reportId: string,
  context: QuestionContext,
): CommandResult<PublicQuestion> {
  return database
    .transaction((): CommandResult<PublicQuestion> => {
      const scope = `research-question:${context.principalId}:${reportId}`;
      const requestHash = commandDigest({ reportId, ...context.command });
      const replay = replayResearchQuestion(
        database,
        reportId,
        context.principalId,
        context.idempotencyKey,
        context.command,
      );
      if (replay.kind !== "missing") return replay;
      const bindingValue = database
        .prepare(`SELECT reports.report_id, report_versions.version_id,
        report_versions.run_id, report_versions.snapshot_id,
        report_versions.artifact_id, artifacts.content_hash,
        runs.status AS run_status
        FROM reports JOIN report_versions USING(report_id)
        JOIN artifacts USING(artifact_id)
        JOIN runs ON runs.run_id = report_versions.run_id
        JOIN research_requests ON research_requests.run_id = reports.run_id
        WHERE reports.report_id = ? AND reports.state = 'published'
          AND research_requests.principal_id = ?
        ORDER BY report_versions.version DESC LIMIT 1`)
        .get(reportId, context.principalId);
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
        database
          .prepare(`SELECT COUNT(*) AS count FROM questions WHERE report_id = ?
          AND status IN ('pending', 'spawn_reserved', 'running')`)
          .get(reportId),
      ).count;
      if (active > 0) return { kind: "active_question" };
      const used = CountSchema.parse(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM questions WHERE report_id = ?",
          )
          .get(reportId),
      ).count;
      if (used >= 20) return { kind: "quota_exhausted" };
      if (context.command.retryOfQuestionId !== undefined) {
        const retry = database
          .prepare(`SELECT status FROM questions
          WHERE question_id = ? AND report_id = ?`)
          .get(context.command.retryOfQuestionId, reportId);
        const parsed = z.object({ status: z.string() }).safeParse(retry);
        if (!parsed.success || parsed.data.status !== "failed")
          return { kind: "illegal_state" };
      }
      const attemptOrdinal = used + 1;
      const localized = context.grounding.question;
      const inputHash = context.grounding.inputHash;
      database
        .prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id, kind,
        logical_key, input_hash, status, created_at) VALUES (?, ?, ?, 'qa', ?, ?,
        'queued', ?)`)
        .run(
          context.ids.jobId,
          binding.run_id,
          binding.snapshot_id,
          `question:${context.ids.questionId}`,
          inputHash,
          context.now,
        );
      database
        .prepare(`INSERT INTO questions(question_id, retry_of_question_id,
        report_id, report_version_id, run_id, snapshot_id, job_id,
        attempt_ordinal, status, question_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .run(
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
        );
      const created = findPublicQuestion(
        database,
        context.principalId,
        context.ids.questionId,
      );
      if (created === undefined) return { kind: "not_found" };
      commitCommand(database, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value: { questionId: context.ids.questionId },
        now: context.now,
      });
      return { kind: "created", value: created };
    })
    .immediate();
}
