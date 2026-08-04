import Database from "better-sqlite3";
import { z } from "zod";
import { findTicker } from "../../../lib/tickers";
import {
  PublicResearchEventSchema,
  type PublicRunDetail,
  PublicRunDetailSchema,
  PublicRunSchema,
} from "../../client/schemas";
import type { ResearchFileData } from "../../compositions/types";
import type { ResearchTarget } from "../../domain/researchTarget";
import { researchReportToFile } from "../../researchReportToFile";
import type { ResearchCompany } from "../../types";
import { prepareLiveResearchRuntime } from "../api/liveResearchApi";
import type { PublicReport } from "../api/researchApiContracts";
import { listPublicEventsForRun } from "../api/researchApiQueries";
import { loadPublicResearchReport } from "../api/researchApiReportReader";
import { publicQuestionFromRow } from "../api/researchQuestionCommands";
import { createLiveS3ArtifactArchive } from "../artifacts/s3ArtifactArchive";
import { parseSafeJson } from "../persistence/sqlite/safeJson";

const ROOM_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;
export const RESEARCH_ROOM_PAGE_SIZE = 32;

export type ResearchRoomScope =
  | "all"
  | "committee"
  | "market"
  | "company"
  | "financial"
  | "risk";

export type ResearchRoomSort = "latest" | "popular";

export type ResearchRoomListOptions = {
  readonly limit?: number;
  readonly offset?: number;
  readonly now?: Date;
  readonly query?: string;
  readonly company?: string;
  readonly scope?: ResearchRoomScope;
  readonly sort?: ResearchRoomSort;
};

const CatalogRowSchema = z.object({
  report_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  version_id: z.string().uuid(),
  version: z.number().int().positive(),
  artifact_id: z.string().uuid(),
  artifact_digest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["complete", "complete_with_limitations"]),
  published_at: z.string().datetime(),
  public_payload_json: z.string(),
  symbol: z.string().min(1),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
  view_count: z.number().int().nonnegative(),
  last_event_seq: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  run_status: z.enum(["completed", "complete-with-limitations"]),
});

const QuestionRowSchema = z.object({
  question_id: z.string().uuid(),
  retry_of_question_id: z.string().uuid().nullable(),
  report_id: z.string().uuid(),
  report_version_id: z.string().uuid(),
  attempt_ordinal: z.number().int().positive(),
  status: z.enum(["answered"]),
  question_json: z.string(),
  answer_json: z.string(),
  created_at: z.string(),
});

export type ResearchRoomAccess = {
  readonly authenticated: boolean;
  readonly tier: "free" | "paid";
};

export type ResearchRoomCatalogItem = {
  readonly reportId: string;
  readonly symbol: string;
  readonly question: string;
  readonly locale: "en" | "ko";
  readonly researchTarget: ResearchTarget;
  readonly publishedAt: string;
  readonly status: "complete" | "complete_with_limitations";
  readonly locked: boolean;
  readonly viewCount: number;
};

export type ResearchRoomCompanyFacet = {
  readonly symbol: string;
  readonly count: number;
};

export type ResearchRoomReportPage = {
  readonly reports: readonly ResearchRoomCatalogItem[];
  readonly total: number;
  readonly companies: readonly ResearchRoomCompanyFacet[];
};

export type ResearchRoomConversation = {
  readonly question: string;
  readonly answer: string;
  readonly agentId: string;
  readonly createdAt: string;
};

export type ResearchRoomReportBundle = {
  readonly item: ResearchRoomCatalogItem;
  readonly file: ResearchFileData;
  readonly company: ResearchCompany;
  readonly conversation: readonly ResearchRoomConversation[];
  readonly runDetail: PublicRunDetail;
  readonly version: number;
};

function targetFor(row: z.infer<typeof CatalogRowSchema>): ResearchTarget {
  return row.research_kind === "department" && row.department_id !== null
    ? { kind: "department", departmentId: row.department_id }
    : { kind: "committee" };
}

function locked(publishedAt: string, access: ResearchRoomAccess, now: Date) {
  return (
    access.tier !== "paid" &&
    now.getTime() - new Date(publishedAt).getTime() < ROOM_DELAY_MS
  );
}

function itemFor(
  row: z.infer<typeof CatalogRowSchema>,
  access: ResearchRoomAccess,
  now: Date,
): ResearchRoomCatalogItem {
  return {
    reportId: row.report_id,
    symbol: row.symbol,
    question: row.question,
    locale: row.locale,
    researchTarget: targetFor(row),
    publishedAt: row.published_at,
    status: row.status,
    locked: locked(row.published_at, access, now),
    viewCount: row.view_count,
  };
}

function publicationFor(row: z.infer<typeof CatalogRowSchema>): PublicReport {
  return {
    reportId: row.report_id,
    artifactId: row.artifact_id,
    artifactDigest: row.artifact_digest,
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    versionId: row.version_id,
    version: row.version,
    status: row.status,
    publishedAt: row.published_at,
    payload: parseSafeJson(row.public_payload_json),
  };
}

function selectSql(where = "") {
  return `SELECT reports.report_id, report_versions.run_id,
    report_versions.snapshot_id, report_versions.version_id,
    report_versions.version, report_versions.artifact_id,
    artifacts.content_hash AS artifact_digest, report_versions.status,
    report_versions.published_at, report_versions.public_payload_json,
    research_requests.symbol, research_requests.question,
    research_requests.locale, research_requests.research_kind,
    research_requests.department_id,
    COALESCE(research_room_views.view_count, 0) AS view_count,
    runs.last_event_seq, runs.created_at, runs.status AS run_status
    FROM reports
    JOIN report_versions USING(report_id)
    JOIN artifacts USING(artifact_id)
    JOIN research_requests USING(run_id)
    JOIN runs USING(run_id)
    LEFT JOIN research_room_views USING(report_id)
    WHERE reports.state = 'published'
      AND report_versions.status IN ('complete', 'complete_with_limitations')
      AND runs.status IN ('completed', 'complete-with-limitations')
      AND report_versions.version = (
        SELECT MAX(latest.version) FROM report_versions AS latest
        WHERE latest.report_id = reports.report_id
      )
      ${where}`;
}

type CatalogFilter = {
  readonly where: string;
  readonly params: readonly string[];
};

function catalogFilter(options: ResearchRoomListOptions): CatalogFilter {
  const clauses: string[] = [];
  const params: string[] = [];
  const query = options.query?.trim().toLocaleLowerCase();
  if (query !== undefined && query.length > 0) {
    const pattern = `%${query.replace(/[\\%_]/gu, "\\$&")}%`;
    clauses.push(
      `(LOWER(research_requests.symbol) LIKE ? ESCAPE '\\' OR
        LOWER(research_requests.question) LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern);
  }
  const company = options.company?.trim().toLocaleUpperCase();
  if (company !== undefined && company.length > 0 && company !== "ALL") {
    clauses.push("research_requests.symbol = ?");
    params.push(company);
  }
  const scope = options.scope ?? "all";
  switch (scope) {
    case "committee":
      clauses.push("research_requests.research_kind = 'committee'");
      break;
    case "market":
    case "company":
    case "financial":
    case "risk":
      clauses.push(
        "research_requests.research_kind = 'department' AND research_requests.department_id = ?",
      );
      params.push(scope);
      break;
    case "all":
      break;
  }
  return {
    where: clauses.length === 0 ? "" : `AND ${clauses.join(" AND ")}`,
    params,
  };
}

function sortSql(sort: ResearchRoomSort): string {
  return sort === "popular"
    ? "ORDER BY view_count DESC, report_versions.published_at DESC, reports.report_id DESC"
    : "ORDER BY report_versions.published_at DESC, reports.report_id DESC";
}

function boundedLimit(value: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.trunc(value ?? fallback), 1), 80);
}

function boundedOffset(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 0), 0), 1_000_000);
}

async function withDatabase<T>(read: (database: Database.Database) => T) {
  const runtime = await prepareLiveResearchRuntime();
  const database = new Database(runtime.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return read(database);
  } finally {
    database.close();
  }
}

async function withWritableDatabase<T>(
  write: (database: Database.Database) => T,
) {
  const runtime = await prepareLiveResearchRuntime();
  const database = new Database(runtime.databasePath, {
    timeout: 5_000,
    fileMustExist: true,
  });
  database.pragma("busy_timeout = 5000");
  try {
    return write(database);
  } finally {
    database.close();
  }
}

export async function listResearchRoomReports(
  access: ResearchRoomAccess,
  options: ResearchRoomListOptions = {},
): Promise<readonly ResearchRoomCatalogItem[]> {
  const page = await listResearchRoomReportPage(access, options);
  return page.reports;
}

export async function listResearchRoomReportPage(
  access: ResearchRoomAccess,
  options: ResearchRoomListOptions = {},
): Promise<ResearchRoomReportPage> {
  const limit = boundedLimit(options.limit, RESEARCH_ROOM_PAGE_SIZE);
  const offset = boundedOffset(options.offset);
  const now = options.now ?? new Date();
  const filter = catalogFilter(options);
  return await withDatabase((database) => {
    const rows = database
      .prepare(
        `${selectSql(filter.where)}
         ${sortSql(options.sort ?? "latest")}
         LIMIT ? OFFSET ?`,
      )
      .all(...filter.params, limit, offset)
      .map((value) => itemFor(CatalogRowSchema.parse(value), access, now));
    const countRow = z
      .object({ count: z.number().int().nonnegative() })
      .parse(
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM (${selectSql(filter.where)}) AS catalog`,
          )
          .get(...filter.params),
      );
    const companies = database
      .prepare(
        `SELECT research_requests.symbol AS symbol, COUNT(*) AS count
         FROM reports
         JOIN report_versions USING(report_id)
         JOIN research_requests USING(run_id)
         JOIN runs USING(run_id)
         WHERE reports.state = 'published'
           AND report_versions.status IN ('complete', 'complete_with_limitations')
           AND runs.status IN ('completed', 'complete-with-limitations')
           AND report_versions.version = (
             SELECT MAX(latest.version) FROM report_versions AS latest
             WHERE latest.report_id = reports.report_id
           )
         GROUP BY research_requests.symbol
         ORDER BY count DESC, symbol ASC`,
      )
      .all()
      .map((value) =>
        z
          .object({
            symbol: z.string().min(1),
            count: z.number().int().positive(),
          })
          .parse(value),
      );
    return {
      reports: rows,
      total: countRow.count,
      companies,
    };
  });
}

export async function recordResearchRoomView(reportId: string): Promise<void> {
  const parsedReportId = z.string().uuid().parse(reportId);
  await withWritableDatabase((database) => {
    database
      .prepare(
        `INSERT INTO research_room_views(report_id, view_count, last_viewed_at)
         SELECT reports.report_id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM reports
         WHERE reports.report_id = ? AND reports.state = 'published'
         ON CONFLICT(report_id) DO UPDATE SET
           view_count = research_room_views.view_count + 1,
           last_viewed_at = excluded.last_viewed_at`,
      )
      .run(parsedReportId);
  });
}

function questionText(value: string, locale: "en" | "ko") {
  try {
    const payload: unknown = JSON.parse(value);
    if (typeof payload !== "object" || payload === null) return value;
    const userQuestion = Reflect.get(payload, "userQuestion");
    if (typeof userQuestion !== "object" || userQuestion === null) return value;
    const localized = Reflect.get(userQuestion, locale);
    return typeof localized === "string" ? localized : value;
  } catch {
    return value;
  }
}

function specialistId(value: string) {
  try {
    const payload: unknown = JSON.parse(value);
    if (typeof payload !== "object" || payload === null) return "chair";
    const specialist = Reflect.get(payload, "specialist");
    if (typeof specialist !== "object" || specialist === null) return "chair";
    const id = Reflect.get(specialist, "id");
    return typeof id === "string" ? id : "chair";
  } catch {
    return "chair";
  }
}

function companyFor(symbol: string, file: ResearchFileData): ResearchCompany {
  const ticker = findTicker(symbol);
  const market = file.marketSnapshot;
  const price =
    market === undefined
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: market.currency,
          maximumFractionDigits: 2,
        }).format(Number.parseFloat(market.price.replace(/,/gu, "")));
  const change =
    market?.changePercent === undefined
      ? "—"
      : `${market.changePercent >= 0 ? "+" : ""}${market.changePercent.toFixed(2)}%`;
  return {
    symbol,
    company: ticker?.company ?? symbol,
    exchange: ticker?.exchange ?? "NASDAQ",
    sector: ticker?.sector ?? "US equity research",
    price,
    change,
    marketStatus: {
      en: "Published community research",
      ko: "공개 리서치룸 발행본",
    },
  };
}

export async function loadResearchRoomReport(
  reportId: string,
  access: ResearchRoomAccess,
  now = new Date(),
): Promise<ResearchRoomReportBundle | "locked" | undefined> {
  const result = await withDatabase((database) => {
    const value = database
      .prepare(
        `${selectSql("AND reports.report_id = ?")}
         ORDER BY report_versions.version DESC LIMIT 1`,
      )
      .get(reportId);
    if (value === undefined) return undefined;
    const row = CatalogRowSchema.parse(value);
    const item = itemFor(row, access, now);
    if (item.locked) return { kind: "locked" as const };
    const questions = database
      .prepare(`SELECT questions.question_id, questions.retry_of_question_id,
        questions.report_id, questions.report_version_id,
        questions.attempt_ordinal, questions.status, questions.question_json,
        questions.answer_json, questions.created_at
        FROM questions
        WHERE questions.report_id = ? AND questions.status = 'answered'
        ORDER BY questions.attempt_ordinal ASC`)
      .all(reportId)
      .map((question) =>
        publicQuestionFromRow(QuestionRowSchema.parse(question)),
      );
    const events = listPublicEventsForRun(database, row.run_id).map((event) =>
      PublicResearchEventSchema.parse(event),
    );
    return { kind: "report" as const, row, item, questions, events };
  });
  if (result === undefined) return undefined;
  if (result.kind === "locked") return "locked";

  const runtime = await prepareLiveResearchRuntime();
  const archive = createLiveS3ArtifactArchive();
  const report = await loadPublicResearchReport(
    {
      dataRoot: runtime.dataRoot,
      ...(archive === undefined ? {} : { remoteArtifacts: archive }),
    },
    publicationFor(result.row),
  );
  if (report === undefined) return undefined;
  const file = researchReportToFile(report, result.item.publishedAt);
  const conversation = result.questions.map((question) => {
    const locale = result.item.locale;
    const answer = question.answer;
    const answerText =
      answer?.summary?.[locale] ??
      answer?.elements.map((element) => element.text[locale]).join(" ") ??
      "";
    return {
      question: questionText(question.question[locale], locale),
      answer: answerText,
      agentId: specialistId(question.question[locale]),
      createdAt: question.createdAt,
    };
  });
  const runDetail = PublicRunDetailSchema.parse({
    run: PublicRunSchema.parse({
      runId: result.row.run_id,
      snapshotId: result.row.snapshot_id,
      symbol: result.row.symbol,
      ...(result.row.question.length === 0
        ? {}
        : { question: result.row.question }),
      locale: result.row.locale,
      researchTarget: result.item.researchTarget,
      status: result.row.run_status,
      lastEventSeq: result.row.last_event_seq,
      createdAt: result.row.created_at,
      reportId: result.row.report_id,
    }),
    events: result.events,
  });
  return {
    item: result.item,
    file,
    company: companyFor(result.item.symbol, file),
    conversation,
    runDetail,
    version: result.row.version,
  };
}

function tokens(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}%]+/u)
      .filter((token) => token.length > 1),
  );
}

export function answerFromPublishedReport(
  file: ResearchFileData,
  question: string,
  locale: "en" | "ko",
): string {
  const requested = tokens(question);
  const ranked = (file.anticipatedQuestions ?? [])
    .map((candidate) => ({
      candidate,
      score: [...tokens(candidate.question[locale])].filter((token) =>
        requested.has(token),
      ).length,
    }))
    .sort((left, right) => right.score - left.score);
  const matched = ranked[0];
  if (matched !== undefined && matched.score > 0)
    return matched.candidate.answer[locale];

  const normalized = question.toLocaleLowerCase();
  if (/risk|downside|fall|bear|위험|하락|리스크|약세/u.test(normalized))
    return [file.concerns[0]?.[locale], file.changeCondition[locale]]
      .filter(Boolean)
      .join(" ");
  if (/price|valuation|expensive|cheap|가격|밸류|비싸|싸다/u.test(normalized))
    return [file.valuation[locale], file.expectation[locale]]
      .filter(Boolean)
      .join(" ");
  if (/change|invalidate|wrong|바뀌|무효|틀/u.test(normalized))
    return file.changeCondition[locale];
  return [file.thesis[locale], file.analysis[0]?.detail[locale]]
    .filter(Boolean)
    .join(" ");
}
