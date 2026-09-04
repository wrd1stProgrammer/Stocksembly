import Database from "better-sqlite3";
import { z } from "zod";
import type { ResearchTarget } from "../../domain/researchTarget";
import { prepareLiveResearchRuntime } from "../api/liveResearchApi";
import { isResearchRoomIndexable } from "./researchRoomIndexability";
import {
  LATEST_PUBLISHABLE_REPORT_VERSION_PREDICATE,
  type StockSymbol,
  StockSymbolSchema,
} from "./researchRoomPublicCatalog";

const StockResearchHubRowSchema = z.object({
  report_id: z.string().uuid(),
  symbol: StockSymbolSchema,
  company: z.string().min(1),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
  published_at: z.string().datetime(),
  status: z.enum(["complete", "complete_with_limitations"]),
});

const StockResearchHubSitemapRowSchema = z.object({
  symbol: StockSymbolSchema,
  published_at: z.string().datetime(),
  status: z.enum(["complete", "complete_with_limitations"]),
});

export type StockResearchHubReport = Readonly<{
  reportId: string;
  question: string;
  locale: "en" | "ko";
  researchTarget: ResearchTarget;
  publishedAt: string;
  status: "complete" | "complete_with_limitations";
}>;

export type StockResearchHub = Readonly<{
  symbol: StockSymbol;
  company: string;
  latestPublishedAt: string;
  reports: readonly StockResearchHubReport[];
}>;

export type StockResearchHubSitemapEntry = Readonly<{
  symbol: StockSymbol;
  lastModified: string;
}>;

function researchTarget(
  row: z.infer<typeof StockResearchHubRowSchema>,
): ResearchTarget {
  return row.research_kind === "department" && row.department_id !== null
    ? { kind: "department", departmentId: row.department_id }
    : { kind: "committee" };
}

function selectSql(filterBySymbol: boolean): string {
  const symbolFilter = filterBySymbol ? "AND research_requests.symbol = ?" : "";
  return `SELECT reports.report_id, research_requests.symbol,
    COALESCE(
      (SELECT symbol_registry.name FROM symbol_registry
       WHERE symbol_registry.user_ticker = research_requests.symbol
         AND symbol_registry.status = 'active'
       ORDER BY symbol_registry.provider_code ASC LIMIT 1),
      research_requests.symbol
    ) AS company,
    research_requests.question, research_requests.locale,
    research_requests.research_kind, research_requests.department_id,
    report_versions.published_at, report_versions.status
   FROM reports
   JOIN report_versions USING(report_id)
   JOIN artifacts USING(artifact_id)
   JOIN research_requests USING(run_id)
   JOIN runs USING(run_id)
   WHERE reports.state = 'published'
     ${symbolFilter}
     AND report_versions.status IN ('complete', 'complete_with_limitations')
     AND runs.status IN ('completed', 'complete-with-limitations')
     AND ${LATEST_PUBLISHABLE_REPORT_VERSION_PREDICATE}
   ORDER BY report_versions.published_at DESC, reports.report_id DESC`;
}

function sitemapSelectSql(): string {
  return `SELECT research_requests.symbol, report_versions.published_at,
    report_versions.status
   FROM reports
   JOIN report_versions USING(report_id)
   JOIN artifacts USING(artifact_id)
   JOIN research_requests USING(run_id)
   JOIN runs USING(run_id)
   WHERE reports.state = 'published'
     AND report_versions.status IN ('complete', 'complete_with_limitations')
     AND runs.status IN ('completed', 'complete-with-limitations')
     AND ${LATEST_PUBLISHABLE_REPORT_VERSION_PREDICATE}
   ORDER BY report_versions.published_at DESC, research_requests.symbol ASC`;
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

async function loadEligibleRows(
  symbol: StockSymbol | undefined,
  now: Date,
): Promise<readonly z.infer<typeof StockResearchHubRowSchema>[]> {
  return await withDatabase((database) => {
    const statement = database.prepare(selectSql(symbol !== undefined));
    const values =
      symbol === undefined ? statement.all() : statement.all(symbol);
    return values.flatMap(
      (value): readonly z.infer<typeof StockResearchHubRowSchema>[] => {
        const row = StockResearchHubRowSchema.safeParse(value);
        return row.success &&
          isResearchRoomIndexable(row.data.status, row.data.published_at, now)
          ? [row.data]
          : [];
      },
    );
  });
}

export async function loadStockResearchHub(
  symbol: StockSymbol,
  now = new Date(),
): Promise<StockResearchHub | undefined> {
  const rows = await loadEligibleRows(symbol, now);
  const first = rows[0];
  if (first === undefined) return undefined;
  return {
    symbol: first.symbol,
    company: first.company,
    latestPublishedAt: first.published_at,
    reports: rows.map((row) => ({
      reportId: row.report_id,
      question: row.question,
      locale: row.locale,
      researchTarget: researchTarget(row),
      publishedAt: row.published_at,
      status: row.status,
    })),
  };
}

export async function listStockResearchHubSitemapEntries(
  now = new Date(),
): Promise<readonly StockResearchHubSitemapEntry[]> {
  const rows = await withDatabase((database) =>
    database
      .prepare(sitemapSelectSql())
      .all()
      .flatMap(
        (
          value,
        ): readonly z.infer<typeof StockResearchHubSitemapRowSchema>[] => {
          const row = StockResearchHubSitemapRowSchema.safeParse(value);
          return row.success &&
            isResearchRoomIndexable(row.data.status, row.data.published_at, now)
            ? [row.data]
            : [];
        },
      ),
  );
  // Mutable by design: reduce multiple reports to one latest entry per symbol.
  const latestBySymbol = new Map<StockSymbol, string>();
  for (const row of rows) {
    const current = latestBySymbol.get(row.symbol);
    if (current === undefined || row.published_at > current)
      latestBySymbol.set(row.symbol, row.published_at);
  }
  return [...latestBySymbol].map(([symbol, lastModified]) => ({
    symbol,
    lastModified,
  }));
}
