import Database from "better-sqlite3";
import { z } from "zod";
import type { ResearchFileData } from "../../compositions/types";
import {
  type ResearchTranslationItem,
  type ResearchTranslationLocale,
  translateResearchText,
} from "./researchTranslationRunner";

export type ResearchQuestionLocalizationInput = {
  readonly runId: string;
  readonly locale: ResearchTranslationLocale;
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
  let input:
    | (ResearchQuestionLocalizationInput & {
        readonly targetLocale: ResearchTranslationLocale;
      })
    | undefined;
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
        targetLocale: row.locale === "en" ? "ko" : "en",
      };
    }
  } finally {
    database.close();
  }
  if (input === undefined) return;
  await localizedResearchQuestions(
    databasePath,
    [input],
    input.targetLocale,
    { translateMissing: true },
  );
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
              AND research_question_localizations.locale =
                CASE research_requests.locale WHEN 'en' THEN 'ko' ELSE 'en' END
          )
        ORDER BY reports.published_at DESC
        LIMIT ?`)
      .all(Math.max(1, Math.min(256, Math.trunc(limit))))
      .map((value) => PublishedQuestionRowSchema.parse(value));
  } finally {
    database.close();
  }
  for (const targetLocale of ["en", "ko"] as const) {
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
): value is Record<ResearchTranslationLocale, string> {
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
  sourceLocale: ResearchTranslationLocale,
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
  targetLocale: ResearchTranslationLocale,
  translated: ReadonlyMap<string, string>,
  path: readonly string[] = [],
): void {
  if (excludedTranslationPath(path)) return;
  if (isLocalizedText(value)) {
    const text = translated.get(JSON.stringify(path));
    if (text !== undefined) value[targetLocale] = text;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      applyTranslations(entry, targetLocale, translated, [
        ...path,
        String(index),
      ]);
    });
  } else if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, entry]) => {
      applyTranslations(entry, targetLocale, translated, [...path, key]);
    });
  }
}

export async function translatedResearchFile(
  databasePath: string,
  reportId: string,
  file: ResearchFileData,
  sourceLocale: ResearchTranslationLocale,
  targetLocale: ResearchTranslationLocale,
): Promise<ResearchFileData> {
  if (sourceLocale === targetLocale) return file;
  const cachedDatabase = openDatabase(databasePath, true);
  try {
    const row = cachedDatabase
      .prepare(`SELECT file_json FROM research_report_translations
        WHERE report_id = ? AND locale = ?`)
      .get(reportId, targetLocale) as
      | { readonly file_json?: unknown }
      | undefined;
    if (typeof row?.file_json === "string")
      return JSON.parse(row.file_json) as ResearchFileData;
  } finally {
    cachedDatabase.close();
  }

  const source = collectLocalizedText(file, sourceLocale);
  const items: ResearchTranslationItem[] = [...source.entries()].map(
    ([id, text]) => ({ id, text }),
  );
  const translated = await translateResearchText(items, targetLocale);
  const output = structuredClone(file) as ResearchFileData;
  applyTranslations(output, targetLocale, translated);
  const database = openDatabase(databasePath);
  try {
    database
      .prepare(`INSERT INTO research_report_translations(
        report_id, locale, file_json, created_at
      ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(report_id, locale) DO UPDATE SET
        file_json = excluded.file_json, created_at = excluded.created_at`)
      .run(reportId, targetLocale, JSON.stringify(output));
  } finally {
    database.close();
  }
  return output;
}
