import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import type {
  NewsEventCard,
  NewsExcerpt,
} from "./insightSentryResearchContracts";
import {
  type NewsClassification,
  NewsClassificationSchema,
} from "./insightSentryResearchSchemas";

const NEWS_CLASSIFIER_CACHE_VERSION = "luna-shortlist-detail-v1";

const TeamSchema = z.enum(["market", "company", "financial", "risk"]);
const RowSchema = z.object({
  event_key: z.string(),
  category: z.enum(["company", "market", "risk"]),
  team_relevance_json: z.string(),
  relevance: z.number(),
  direction: z.enum(["positive", "negative", "mixed", "neutral"]),
  horizon: z.enum(["immediate", "near_term", "long_term"]),
  verification_need: z.enum(["required", "recommended", "none"]),
  title: z.string(),
  published_at: z.string(),
  source: z.string().nullable(),
  link: z.string().nullable(),
  excerpt: z.string().nullable(),
});

export type StoredNewsEvent = {
  readonly event: NewsEventCard;
  readonly excerpt?: NewsExcerpt;
};

async function openLedger(dataRoot: string): Promise<Database.Database> {
  const directory = join(dataRoot, "insightsentry");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const database = new Database(join(directory, "news-events.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`CREATE TABLE IF NOT EXISTS news_events (
    symbol TEXT NOT NULL,
    event_key TEXT NOT NULL,
    direction TEXT NOT NULL,
    category TEXT NOT NULL,
    team_relevance_json TEXT NOT NULL,
    relevance REAL NOT NULL,
    horizon TEXT NOT NULL,
    verification_need TEXT NOT NULL,
    title TEXT NOT NULL,
    published_at TEXT NOT NULL,
    source TEXT,
    link TEXT,
    excerpt TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY(symbol, event_key, direction)
  );
  CREATE INDEX IF NOT EXISTS news_events_symbol_published
    ON news_events(symbol, published_at DESC);
  CREATE TABLE IF NOT EXISTS news_candidate_classifications (
    symbol TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    classifier_version TEXT NOT NULL,
    decision_status TEXT NOT NULL CHECK(decision_status IN ('detailed', 'screened_out')),
    classification_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    classified_at TEXT NOT NULL,
    PRIMARY KEY(symbol, candidate_id, classifier_version)
  );
  CREATE INDEX IF NOT EXISTS news_candidate_classifications_symbol_published
    ON news_candidate_classifications(symbol, published_at DESC);`);
  return database;
}

export type CachedNewsClassification = {
  readonly candidateId: string;
  readonly status: "detailed" | "screened_out";
  readonly classification: NewsClassification;
};

export async function readNewsCandidateClassifications(input: {
  readonly dataRoot?: string;
  readonly symbol: string;
  readonly candidateIds: readonly string[];
}): Promise<readonly CachedNewsClassification[]> {
  if (input.dataRoot === undefined || input.candidateIds.length === 0)
    return [];
  const database = await openLedger(input.dataRoot);
  try {
    const placeholders = input.candidateIds.map(() => "?").join(",");
    const rows = database
      .prepare(
        `SELECT candidate_id, decision_status, classification_json
        FROM news_candidate_classifications
        WHERE symbol = ? AND classifier_version = ?
          AND candidate_id IN (${placeholders})`,
      )
      .all(input.symbol, NEWS_CLASSIFIER_CACHE_VERSION, ...input.candidateIds);
    return rows.flatMap((row) => {
      const parsed = z
        .object({
          candidate_id: z.string(),
          decision_status: z.enum(["detailed", "screened_out"]),
          classification_json: z.string(),
        })
        .safeParse(row);
      if (!parsed.success) return [];
      try {
        const classification = NewsClassificationSchema.parse(
          JSON.parse(parsed.data.classification_json),
        );
        return [
          Object.freeze({
            candidateId: parsed.data.candidate_id,
            status: parsed.data.decision_status,
            classification,
          }),
        ];
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          return [];
        throw error;
      }
    });
  } finally {
    database.close();
  }
}

export async function writeNewsCandidateClassifications(input: {
  readonly dataRoot?: string;
  readonly symbol: string;
  readonly classifiedAt: string;
  readonly publishedAtByCandidateId: ReadonlyMap<string, string>;
  readonly detailed: readonly NewsClassification[];
  readonly screenedOut: readonly NewsClassification[];
}): Promise<void> {
  if (
    input.dataRoot === undefined ||
    input.detailed.length + input.screenedOut.length === 0
  )
    return;
  const database = await openLedger(input.dataRoot);
  try {
    const statement =
      database.prepare(`INSERT INTO news_candidate_classifications(
      symbol, candidate_id, classifier_version, decision_status,
      classification_json, published_at, classified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, candidate_id, classifier_version) DO UPDATE SET
      decision_status = excluded.decision_status,
      classification_json = excluded.classification_json,
      published_at = excluded.published_at,
      classified_at = excluded.classified_at`);
    const write = database.transaction(() => {
      for (const [status, decisions] of [
        ["detailed", input.detailed],
        ["screened_out", input.screenedOut],
      ] as const)
        for (const decision of decisions)
          statement.run(
            input.symbol,
            decision.candidateId,
            NEWS_CLASSIFIER_CACHE_VERSION,
            status,
            JSON.stringify(decision),
            input.publishedAtByCandidateId.get(decision.candidateId) ??
              input.classifiedAt,
            input.classifiedAt,
          );
      database
        .prepare(
          "DELETE FROM news_candidate_classifications WHERE published_at < ?",
        )
        .run(
          new Date(
            Date.parse(input.classifiedAt) - 400 * 24 * 60 * 60 * 1_000,
          ).toISOString(),
        );
    });
    write();
  } finally {
    database.close();
  }
}

function decodeTeams(value: string): NewsEventCard["teamRelevance"] {
  try {
    const parsed = z.array(TeamSchema).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return [];
  }
}

export async function readNewsEventLedger(input: {
  readonly dataRoot?: string;
  readonly symbol: string;
  readonly from: string;
  readonly to: string;
}): Promise<readonly StoredNewsEvent[]> {
  if (input.dataRoot === undefined) return [];
  const database = await openLedger(input.dataRoot);
  try {
    const rows = database
      .prepare(
        `SELECT event_key, category, team_relevance_json, relevance,
          direction, horizon, verification_need, title, published_at,
          source, link, excerpt
        FROM news_events
        WHERE symbol = ? AND published_at >= ? AND published_at <= ?
        ORDER BY published_at DESC, relevance DESC`,
      )
      .all(input.symbol, input.from, input.to);
    return rows.flatMap((row) => {
      const parsed = RowSchema.safeParse(row);
      if (!parsed.success) return [];
      const value = parsed.data;
      const event = Object.freeze({
        eventKey: value.event_key,
        category: value.category,
        teamRelevance: Object.freeze([
          ...decodeTeams(value.team_relevance_json),
        ]),
        relevance: value.relevance,
        direction: value.direction,
        horizon: value.horizon,
        verificationNeed: value.verification_need,
        title: value.title,
        publishedAt: value.published_at,
        ...(value.source === null ? {} : { source: value.source }),
        ...(value.link === null ? {} : { link: value.link }),
      }) satisfies NewsEventCard;
      return [
        Object.freeze({
          event,
          ...(value.excerpt === null
            ? {}
            : {
                excerpt: Object.freeze({
                  eventKey: event.eventKey,
                  content: value.excerpt,
                }),
              }),
        }),
      ];
    });
  } finally {
    database.close();
  }
}

export async function writeNewsEventLedger(input: {
  readonly dataRoot?: string;
  readonly symbol: string;
  readonly observedAt: string;
  readonly events: readonly NewsEventCard[];
  readonly excerpts: readonly NewsExcerpt[];
}): Promise<void> {
  if (input.dataRoot === undefined || input.events.length === 0) return;
  const database = await openLedger(input.dataRoot);
  try {
    const excerptByKey = new Map(
      input.excerpts.map((excerpt) => [excerpt.eventKey, excerpt.content]),
    );
    const statement = database.prepare(`INSERT INTO news_events(
      symbol, event_key, direction, category, team_relevance_json,
      relevance, horizon, verification_need, title, published_at,
      source, link, excerpt, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, event_key, direction) DO UPDATE SET
      category = excluded.category,
      team_relevance_json = excluded.team_relevance_json,
      relevance = excluded.relevance,
      horizon = excluded.horizon,
      verification_need = excluded.verification_need,
      title = excluded.title,
      published_at = excluded.published_at,
      source = COALESCE(excluded.source, news_events.source),
      link = COALESCE(excluded.link, news_events.link),
      excerpt = COALESCE(excluded.excerpt, news_events.excerpt),
      last_seen_at = excluded.last_seen_at`);
    const write = database.transaction(() => {
      for (const event of input.events)
        statement.run(
          input.symbol,
          event.eventKey,
          event.direction,
          event.category,
          JSON.stringify(event.teamRelevance),
          event.relevance,
          event.horizon,
          event.verificationNeed,
          event.title,
          event.publishedAt,
          event.source ?? null,
          event.link ?? null,
          excerptByKey.get(event.eventKey) ?? null,
          input.observedAt,
          input.observedAt,
        );
      database
        .prepare("DELETE FROM news_events WHERE published_at < ?")
        .run(
          new Date(
            Date.parse(input.observedAt) - 400 * 24 * 60 * 60 * 1_000,
          ).toISOString(),
        );
    });
    write();
  } finally {
    database.close();
  }
}
