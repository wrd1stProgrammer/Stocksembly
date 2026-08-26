import Database from "better-sqlite3";
import { z } from "zod";
import type { ResearchLocale } from "../../application/createMandateContracts";
import type { PublicRunDetail } from "../../client/schemas";
import type { ResearchFileData } from "../../compositions/types";
import {
  type ResearchTranslationItem,
  translateResearchText,
} from "./researchTranslationRunner";
import {
  RESEARCH_TRANSLATION_LOCALES,
  type ResearchTranslationLocale,
} from "./researchTranslationLocales";

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
    /^(?:evidenceIndex|coverage|sources?|sourceRefs|sourceArtifactIds|evidenceArtifactIds|counterevidenceArtifactIds|citations?)$/u.test(
      part,
    ),
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
  readonly schemaVersion: 1;
  readonly file: ResearchFileData;
  readonly runDetail: PublicRunDetail;
  readonly conversation: readonly ResearchTranslationConversation[];
};

function translationCacheEnvelope(
  value: unknown,
): TranslationCacheEnvelope | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as MutableRecord;
  if (
    record["schemaVersion"] !== 1 ||
    typeof record["file"] !== "object" ||
    record["file"] === null ||
    typeof record["runDetail"] !== "object" ||
    record["runDetail"] === null ||
    !Array.isArray(record["conversation"])
  )
    return undefined;
  return value as TranslationCacheEnvelope;
}

function translatedRenderLocale(
  targetLocale: ResearchTranslationLocale,
): ResearchLocale {
  return targetLocale === "ko" ? "ko" : "en";
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
  const cachedDatabase = openDatabase(databasePath, true);
  let cachedFile: ResearchFileData | undefined;
  let cachedEnvelope: TranslationCacheEnvelope | undefined;
  let cachedQuestion: string | undefined;
  try {
    const fileRow = cachedDatabase
      .prepare(`SELECT file_json FROM research_report_translations
        WHERE report_id = ? AND locale = ?`)
      .get(reportId, targetLocale) as
      | { readonly file_json?: unknown }
      | undefined;
    if (typeof fileRow?.file_json === "string") {
      const parsed: unknown = JSON.parse(fileRow.file_json);
      cachedEnvelope = translationCacheEnvelope(parsed);
      cachedFile = cachedEnvelope?.file ?? (parsed as ResearchFileData);
    }
    const questionRow = cachedDatabase
      .prepare(`SELECT question FROM research_question_localizations
        WHERE run_id = ? AND locale = ?`)
      .get(runId, targetLocale) as { readonly question?: unknown } | undefined;
    if (typeof questionRow?.question === "string")
      cachedQuestion = questionRow.question;
  } finally {
    cachedDatabase.close();
  }

  if (cachedEnvelope !== undefined && cachedQuestion !== undefined)
    return {
      file: cachedEnvelope.file,
      question: cachedQuestion,
      runDetail: cachedEnvelope.runDetail,
      conversation: cachedEnvelope.conversation,
      renderLocale,
    };

  const source =
    cachedFile === undefined
      ? new Map(collectLocalizedText(file, sourceLocale))
      : new Map<string, string>();
  collectLocalizedText(runDetail, sourceLocale, ["__runDetail__"], source);
  conversation.forEach((exchange, index) => {
    if (exchange.question.trim().length > 0)
      source.set(`__conversation__:${index}:question`, exchange.question);
    if (exchange.answer.trim().length > 0)
      source.set(`__conversation__:${index}:answer`, exchange.answer);
  });
  if (cachedQuestion === undefined) source.set("__question__", question.trim());
  const items: ResearchTranslationItem[] = [...source.entries()].map(
    ([id, text]) => ({ id, text }),
  );
  const translated = await translateResearchText(items, targetLocale);
  const output = cachedFile ?? (structuredClone(file) as ResearchFileData);
  if (cachedFile === undefined)
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
  const translatedQuestion =
    cachedQuestion ?? translated.get("__question__")?.trim();
  if (translatedQuestion === undefined || translatedQuestion.length === 0)
    throw new TypeError("research_question_translation_incomplete");
  const database = openDatabase(databasePath);
  try {
    const saveFile = database.prepare(`INSERT INTO research_report_translations(
      report_id, locale, file_json, created_at
    ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(report_id, locale) DO UPDATE SET
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
        JSON.stringify({
          schemaVersion: 1,
          file: output,
          runDetail: translatedRunDetail,
          conversation: translatedConversation,
        } satisfies TranslationCacheEnvelope),
      );
      if (cachedQuestion === undefined)
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
