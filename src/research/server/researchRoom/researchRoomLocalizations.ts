import Database from "better-sqlite3";
import { z } from "zod";
import type { ResearchLocale } from "../../application/createMandateContracts";
import type { PublicRunDetail } from "../../client/schemas";
import type { ResearchFileData } from "../../compositions/types";
import {
  RESEARCH_TRANSLATION_LOCALES,
  type ResearchTranslationLocale,
} from "./researchTranslationLocales";
import {
  RESEARCH_TRANSLATION_MODEL_VERSION,
  type ResearchTranslationBatchInvocation,
  type ResearchTranslationExecutionOptions,
  type ResearchTranslationItem,
  translateResearchText,
} from "./researchTranslationRunner";

export type ResearchQuestionLocalizationInput = {
  readonly runId: string;
  readonly locale: ResearchLocale;
  readonly question: string;
};

const QuestionLocalizationRowSchema = z.object({
  run_id: z.string().uuid(),
  question: z.string().min(1),
});

const PublishedQuestionRowSchema = QuestionLocalizationRowSchema.extend({
  locale: z.enum(["en", "ko"]),
});

function openDatabase(databasePath: string, readonly = false) {
  const database = new Database(databasePath, {
    readonly,
    fileMustExist: true,
    timeout: 5_000,
  });
  database.pragma("foreign_keys = ON");
  if (!readonly) database.pragma("busy_timeout = 5000");
  return database;
}

export async function localizedResearchQuestions(
  databasePath: string,
  inputs: readonly ResearchQuestionLocalizationInput[],
  targetLocale: ResearchTranslationLocale,
  options: { readonly translateMissing?: boolean } = {},
): Promise<ReadonlyMap<string, string>> {
  if (inputs.length === 0) return new Map();
  const writable = openDatabase(databasePath);
  try {
    const insert =
      writable.prepare(`INSERT INTO research_question_localizations(
      run_id, locale, question, created_at
    ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(run_id, locale) DO NOTHING`);
    writable.transaction(() => {
      for (const input of inputs)
        insert.run(input.runId, input.locale, input.question.trim());
    })();
  } finally {
    writable.close();
  }

  const placeholders = inputs.map(() => "?").join(", ");
  const existingDatabase = openDatabase(databasePath, true);
  let existing: readonly z.infer<typeof QuestionLocalizationRowSchema>[];
  try {
    existing = existingDatabase
      .prepare(`SELECT run_id, question
        FROM research_question_localizations
        WHERE locale = ? AND run_id IN (${placeholders})`)
      .all(targetLocale, ...inputs.map((input) => input.runId))
      .map((value) => QuestionLocalizationRowSchema.parse(value));
  } finally {
    existingDatabase.close();
  }
  const result = new Map(existing.map((row) => [row.run_id, row.question]));
  const missing = inputs.filter((input) => !result.has(input.runId));
  if (missing.length === 0) return result;

  if (options.translateMissing !== true) {
    for (const input of missing) result.set(input.runId, input.question);
    return result;
  }

  try {
    const translated = await translateResearchText(
      missing.map((input) => ({ id: input.runId, text: input.question })),
      targetLocale,
    );
    const database = openDatabase(databasePath);
    try {
      const save =
        database.prepare(`INSERT INTO research_question_localizations(
        run_id, locale, question, created_at
      ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(run_id, locale) DO UPDATE SET question = excluded.question`);
      database.transaction(() => {
        for (const input of missing) {
          const question = translated.get(input.runId);
          if (question === undefined) continue;
          save.run(input.runId, targetLocale, question);
          result.set(input.runId, question);
        }
      })();
    } finally {
      database.close();
    }
  } catch (error) {
    if (process.env["NODE_ENV"] !== "production")
      process.stderr.write(
        `${JSON.stringify({
          kind: "research_question_translation_failed",
          errorName: error instanceof Error ? error.name : "Unknown",
        })}\n`,
      );
  }
  for (const input of missing)
    if (!result.has(input.runId)) result.set(input.runId, input.question);
  return result;
}

export async function ensurePublishedResearchQuestionLocalizations(
  databasePath: string,
  runId: string,
): Promise<void> {
  const database = openDatabase(databasePath, true);
  let input: ResearchQuestionLocalizationInput | undefined;
  try {
    const row = database
      .prepare(`SELECT research_requests.run_id, research_requests.locale,
        research_requests.question
        FROM research_requests
        JOIN reports USING(run_id)
        WHERE research_requests.run_id = ? AND reports.state = 'published'
        LIMIT 1`)
      .get(runId) as
      | {
          readonly run_id?: unknown;
          readonly locale?: unknown;
          readonly question?: unknown;
        }
      | undefined;
    if (
      typeof row?.run_id === "string" &&
      (row.locale === "en" || row.locale === "ko") &&
      typeof row.question === "string" &&
      row.question.trim() !== ""
    ) {
      input = {
        runId: row.run_id,
        locale: row.locale,
        question: row.question,
      };
    }
  } finally {
    database.close();
  }
  if (input === undefined) return;
  for (const targetLocale of RESEARCH_TRANSLATION_LOCALES) {
    if (targetLocale === input.locale) continue;
    await localizedResearchQuestions(databasePath, [input], targetLocale, {
      translateMissing: true,
    });
  }
}

export async function backfillPublishedResearchQuestionLocalizations(
  databasePath: string,
  limit = 64,
): Promise<number> {
  const database = openDatabase(databasePath, true);
  let rows: readonly z.infer<typeof PublishedQuestionRowSchema>[];
  try {
    rows = database
      .prepare(`SELECT research_requests.run_id, research_requests.locale,
          research_requests.question
        FROM research_requests
        JOIN reports USING(run_id)
        WHERE reports.state = 'published'
          AND NOT EXISTS (
            SELECT 1 FROM research_question_localizations
            WHERE research_question_localizations.run_id = research_requests.run_id
            GROUP BY research_question_localizations.run_id
            HAVING COUNT(DISTINCT research_question_localizations.locale) >= ?
          )
        ORDER BY research_requests.created_at DESC
        LIMIT ?`)
      .all(
        RESEARCH_TRANSLATION_LOCALES.length,
        Math.max(1, Math.min(256, Math.trunc(limit))),
      )
      .map((value) => PublishedQuestionRowSchema.parse(value));
  } finally {
    database.close();
  }
  for (const targetLocale of RESEARCH_TRANSLATION_LOCALES) {
    const inputs = rows
      .filter((row) => row.locale !== targetLocale)
      .map(
        (row): ResearchQuestionLocalizationInput => ({
          runId: row.run_id,
          locale: row.locale,
          question: row.question,
        }),
      );
    if (inputs.length > 0)
      await localizedResearchQuestions(databasePath, inputs, targetLocale, {
        translateMissing: true,
      });
  }
  return rows.length;
}

type MutableRecord = Record<string, unknown>;

function isLocalizedText(
  value: unknown,
): value is Record<ResearchLocale, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as MutableRecord;
  return typeof record["en"] === "string" && typeof record["ko"] === "string";
}

function excludedTranslationPath(path: readonly string[]): boolean {
  return path.some((part) =>
    /^(?:evidenceIndex|coverage|sources?|sourceRefs|sourceArtifactIds|evidenceArtifactIds|counterevidenceArtifactIds|citations?|sourceUrl|url|exactQuote|quote|quotation|excerpt|sourceExcerpt|identifiers?|ticker|symbol)$/u.test(
      part,
    ),
  );
}

function protectedTranslationLiteral(text: string): boolean {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/u.test(trimmed)) return true;
  if (/^[A-Z0-9][A-Z0-9._:/-]*$/u.test(trimmed)) return true;
  return (
    (/^"[\s\S]*"$/u.test(trimmed) ||
      /^'[\s\S]*'$/u.test(trimmed) ||
      /^“[\s\S]*”$/u.test(trimmed) ||
      /^‘[\s\S]*’$/u.test(trimmed)) &&
    trimmed.length >= 2
  );
}

function collectLocalizedText(
  value: unknown,
  sourceLocale: ResearchLocale,
  path: readonly string[] = [],
  output = new Map<string, string>(),
): ReadonlyMap<string, string> {
  if (excludedTranslationPath(path)) return output;
  if (isLocalizedText(value)) {
    const text = value[sourceLocale].trim();
    if (/\p{L}/u.test(text)) output.set(JSON.stringify(path), text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectLocalizedText(
        entry,
        sourceLocale,
        [...path, String(index)],
        output,
      );
    });
  } else if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, entry]) => {
      collectLocalizedText(entry, sourceLocale, [...path, key], output);
    });
  }
  return output;
}

function applyTranslations(
  value: unknown,
  renderLocale: ResearchLocale,
  translated: ReadonlyMap<string, string>,
  path: readonly string[] = [],
): void {
  if (excludedTranslationPath(path)) return;
  if (isLocalizedText(value)) {
    const text = translated.get(JSON.stringify(path));
    if (text !== undefined) value[renderLocale] = text;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      applyTranslations(entry, renderLocale, translated, [
        ...path,
        String(index),
      ]);
    });
  } else if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, entry]) => {
      applyTranslations(entry, renderLocale, translated, [...path, key]);
    });
  }
}

export type TranslatedResearchProjection = {
  readonly file: ResearchFileData;
  readonly question: string;
  readonly runDetail: PublicRunDetail;
  readonly conversation: readonly ResearchTranslationConversation[];
  readonly renderLocale: ResearchLocale;
};

export type ResearchTranslationConversation = {
  readonly question: string;
  readonly answer: string;
  readonly agentId: string;
  readonly createdAt: string;
};

type TranslationCacheEnvelope = {
  readonly schemaVersion: 2;
  readonly file: ResearchFileData;
  readonly question: string;
  readonly runDetail: PublicRunDetail;
  readonly conversation: readonly ResearchTranslationConversation[];
};

function translationCacheEnvelope(
  value: unknown,
): TranslationCacheEnvelope | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as MutableRecord;
  if (
    record["schemaVersion"] !== 2 ||
    typeof record["file"] !== "object" ||
    record["file"] === null ||
    typeof record["question"] !== "string" ||
    record["question"].trim() === "" ||
    typeof record["runDetail"] !== "object" ||
    record["runDetail"] === null ||
    !Array.isArray(record["conversation"])
  )
    return undefined;
  return value as TranslationCacheEnvelope;
}

export const RESEARCH_TRANSLATION_SCHEMA_VERSION = 2;

export type ResearchTranslationCacheKey = {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly sourceContentHash: string;
  readonly sourceLocale: ResearchLocale;
  readonly targetLocale: ResearchTranslationLocale;
  readonly translationSchemaVersion: number;
  readonly modelVersion: string;
};

export type ResearchTranslationModelCall = {
  readonly invocationId: string;
  readonly batchOrdinal: number;
  readonly batchInputHash: string;
  readonly outcome: "started" | "succeeded" | "failed";
};

const TranslationModelCallRowSchema = z.object({
  invocation_id: z.string().uuid(),
  batch_ordinal: z.number().int().positive(),
  batch_input_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  outcome: z.enum(["started", "succeeded", "failed"]),
});

export function researchTranslationModelCalls(
  databasePath: string,
  key: ResearchTranslationCacheKey,
): readonly ResearchTranslationModelCall[] {
  const database = openDatabase(databasePath, true);
  try {
    return database
      .prepare(`SELECT invocation_id, batch_ordinal, batch_input_hash, outcome
        FROM research_translation_model_calls
        WHERE report_id = ? AND report_version = ? AND source_content_hash = ?
          AND source_locale = ? AND target_locale = ?
          AND translation_schema_version = ? AND model_version = ?
        ORDER BY batch_ordinal, invocation_id`)
      .all(
        key.reportId,
        key.reportVersion,
        key.sourceContentHash,
        key.sourceLocale,
        key.targetLocale,
        key.translationSchemaVersion,
        key.modelVersion,
      )
      .map((value) => TranslationModelCallRowSchema.parse(value))
      .map((row) => ({
        invocationId: row.invocation_id,
        batchOrdinal: row.batch_ordinal,
        batchInputHash: row.batch_input_hash,
        outcome: row.outcome,
      }));
  } finally {
    database.close();
  }
}

type TranslatedResearchProjectionOptions = {
  readonly translationSchemaVersion?: number;
  readonly modelVersion?: string;
  readonly invokeBatch?: ResearchTranslationExecutionOptions["invokeBatch"];
};

function translationSourceVersion(
  databasePath: string,
  reportId: string,
  runId: string,
): Pick<ResearchTranslationCacheKey, "reportVersion" | "sourceContentHash"> {
  const database = openDatabase(databasePath, true);
  try {
    const row = database
      .prepare(`SELECT report_versions.version, artifacts.content_hash
        FROM report_versions
        JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
        WHERE report_versions.report_id = ? AND report_versions.run_id = ?
        ORDER BY report_versions.version DESC
        LIMIT 1`)
      .get(reportId, runId) as
      | { readonly version?: unknown; readonly content_hash?: unknown }
      | undefined;
    const version = row?.version;
    const contentHash = row?.content_hash;
    if (
      typeof version !== "number" ||
      !Number.isSafeInteger(version) ||
      typeof contentHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(contentHash)
    )
      throw new TypeError("research_translation_source_version_missing");
    return {
      reportVersion: version,
      sourceContentHash: contentHash,
    };
  } finally {
    database.close();
  }
}

function recordTranslationInvocation(
  databasePath: string,
  key: ResearchTranslationCacheKey,
  batch: ResearchTranslationBatchInvocation,
): void {
  const database = openDatabase(databasePath);
  try {
    database
      .prepare(`INSERT INTO research_translation_model_calls(
        invocation_id, report_id, report_version, source_content_hash,
        source_locale, target_locale, translation_schema_version, model_version,
        batch_ordinal, batch_input_hash, outcome, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .run(
        batch.invocationId,
        key.reportId,
        key.reportVersion,
        key.sourceContentHash,
        key.sourceLocale,
        key.targetLocale,
        key.translationSchemaVersion,
        key.modelVersion,
        batch.ordinal,
        batch.inputHash,
      );
  } finally {
    database.close();
  }
}

function completeTranslationInvocation(
  databasePath: string,
  invocationId: string,
  outcome: "succeeded" | "failed",
): void {
  const database = openDatabase(databasePath);
  try {
    database
      .prepare(`UPDATE research_translation_model_calls SET outcome = ?
        WHERE invocation_id = ? AND outcome = 'started'`)
      .run(outcome, invocationId);
  } finally {
    database.close();
  }
}

function translatedRenderLocale(
  targetLocale: ResearchTranslationLocale,
): ResearchLocale {
  return targetLocale === "ko" ? "ko" : "en";
}

export function publicResearchTranslationItems(
  file: ResearchFileData,
  question: string,
  runDetail: PublicRunDetail,
  conversation: readonly ResearchTranslationConversation[],
  sourceLocale: ResearchLocale,
): readonly ResearchTranslationItem[] {
  const source = new Map(collectLocalizedText(file, sourceLocale));
  collectLocalizedText(runDetail, sourceLocale, ["__runDetail__"], source);
  conversation.forEach((exchange, index) => {
    if (
      exchange.question.trim().length > 0 &&
      !protectedTranslationLiteral(exchange.question)
    )
      source.set(`__conversation__:${index}:question`, exchange.question);
    if (
      exchange.answer.trim().length > 0 &&
      !protectedTranslationLiteral(exchange.answer)
    )
      source.set(`__conversation__:${index}:answer`, exchange.answer);
  });
  if (question.trim().length > 0 && !protectedTranslationLiteral(question))
    source.set("__question__", question.trim());
  return Object.freeze(
    [...source.entries()].map(([id, text]) => Object.freeze({ id, text })),
  );
}

export async function translatedResearchProjection(
  databasePath: string,
  reportId: string,
  runId: string,
  file: ResearchFileData,
  question: string,
  runDetail: PublicRunDetail,
  conversation: readonly ResearchTranslationConversation[],
  sourceLocale: ResearchLocale,
  targetLocale: ResearchTranslationLocale,
  options: TranslatedResearchProjectionOptions = {},
): Promise<TranslatedResearchProjection> {
  const renderLocale = translatedRenderLocale(targetLocale);
  if (sourceLocale === targetLocale)
    return {
      file,
      question,
      runDetail,
      conversation,
      renderLocale: sourceLocale,
    };
  const sourceVersion = translationSourceVersion(databasePath, reportId, runId);
  const cacheKey: ResearchTranslationCacheKey = {
    reportId,
    ...sourceVersion,
    sourceLocale,
    targetLocale,
    translationSchemaVersion:
      options.translationSchemaVersion ?? RESEARCH_TRANSLATION_SCHEMA_VERSION,
    modelVersion: options.modelVersion ?? RESEARCH_TRANSLATION_MODEL_VERSION,
  };
  const cachedDatabase = openDatabase(databasePath, true);
  let cachedEnvelope: TranslationCacheEnvelope | undefined;
  try {
    const fileRow = cachedDatabase
      .prepare(`SELECT file_json FROM research_report_translations
        WHERE report_id = ? AND report_version = ? AND source_content_hash = ?
          AND source_locale = ? AND locale = ?
          AND translation_schema_version = ? AND model_version = ?`)
      .get(
        reportId,
        cacheKey.reportVersion,
        cacheKey.sourceContentHash,
        sourceLocale,
        targetLocale,
        cacheKey.translationSchemaVersion,
        cacheKey.modelVersion,
      ) as { readonly file_json?: unknown } | undefined;
    if (typeof fileRow?.file_json === "string") {
      const parsed: unknown = JSON.parse(fileRow.file_json);
      cachedEnvelope = translationCacheEnvelope(parsed);
    }
  } finally {
    cachedDatabase.close();
  }

  if (cachedEnvelope !== undefined)
    return {
      file: cachedEnvelope.file,
      question: cachedEnvelope.question,
      runDetail: cachedEnvelope.runDetail,
      conversation: cachedEnvelope.conversation,
      renderLocale,
    };

  const items = publicResearchTranslationItems(
    file,
    question,
    runDetail,
    conversation,
    sourceLocale,
  );
  const translated = await translateResearchText(items, targetLocale, {
    beforeBatchInvocation: async (batch) =>
      recordTranslationInvocation(databasePath, cacheKey, batch),
    afterBatchInvocation: async (batch, outcome) =>
      completeTranslationInvocation(databasePath, batch.invocationId, outcome),
    ...(options.invokeBatch === undefined
      ? {}
      : { invokeBatch: options.invokeBatch }),
  });
  const output = structuredClone(file) as ResearchFileData;
  applyTranslations(output, renderLocale, translated);
  const translatedRunDetail = structuredClone(runDetail) as PublicRunDetail;
  applyTranslations(translatedRunDetail, renderLocale, translated, [
    "__runDetail__",
  ]);
  const translatedConversation = conversation.map((exchange, index) => ({
    ...exchange,
    question:
      translated.get(`__conversation__:${index}:question`) ?? exchange.question,
    answer:
      translated.get(`__conversation__:${index}:answer`) ?? exchange.answer,
  }));
  const translatedQuestion = protectedTranslationLiteral(question)
    ? question.trim()
    : translated.get("__question__")?.trim();
  if (translatedQuestion === undefined || translatedQuestion.length === 0)
    throw new TypeError("research_question_translation_incomplete");
  const database = openDatabase(databasePath);
  try {
    const saveFile = database.prepare(`INSERT INTO research_report_translations(
      report_id, locale, source_locale, report_version, source_content_hash,
      translation_schema_version, model_version, file_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(
      report_id, report_version, source_content_hash, source_locale, locale,
      translation_schema_version, model_version
    ) DO UPDATE SET
      file_json = excluded.file_json, created_at = excluded.created_at`);
    const saveQuestion =
      database.prepare(`INSERT INTO research_question_localizations(
      run_id, locale, question, created_at
    ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(run_id, locale) DO UPDATE SET
      question = excluded.question, created_at = excluded.created_at`);
    database.transaction(() => {
      saveFile.run(
        reportId,
        targetLocale,
        sourceLocale,
        cacheKey.reportVersion,
        cacheKey.sourceContentHash,
        cacheKey.translationSchemaVersion,
        cacheKey.modelVersion,
        JSON.stringify({
          schemaVersion: 2,
          file: output,
          question: translatedQuestion,
          runDetail: translatedRunDetail,
          conversation: translatedConversation,
        } satisfies TranslationCacheEnvelope),
      );
      saveQuestion.run(runId, targetLocale, translatedQuestion);
    })();
  } finally {
    database.close();
  }
  return {
    file: output,
    question: translatedQuestion,
    runDetail: translatedRunDetail,
    conversation: translatedConversation,
    renderLocale,
  };
}
