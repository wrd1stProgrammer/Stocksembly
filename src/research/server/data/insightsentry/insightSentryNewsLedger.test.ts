// @vitest-environment node
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  readNewsCandidateClassifications,
  readNewsEventLedger,
  writeNewsCandidateClassifications,
  writeNewsEventLedger,
} from "./insightSentryNewsLedger";
import type { NewsEventCard } from "./insightSentryResearchContracts";
import type { NewsClassification } from "./insightSentryResearchSchemas";

const databaseUrl = process.env["STOCKSEMBLY_NEWS_TEST_DATABASE_URL"];
const integration = test.skipIf(!databaseUrl);
let pool: Pool;
const now = "2026-09-13T00:00:00.000Z";
const event: NewsEventCard = {
  eventKey: "earnings",
  category: "company",
  teamRelevance: ["financial"],
  relevance: 0.9,
  direction: "positive",
  horizon: "near_term",
  verificationNeed: "required",
  title: "Earnings",
  publishedAt: now,
};
const classification: NewsClassification = {
  candidateId: "candidate",
  eventKey: "earnings",
  category: "company",
  relevance: 0.9,
  materiality: "material",
  novelty: "unique",
  direction: "positive",
  horizon: "near_term",
  verificationNeed: "required",
};

beforeAll(async () => {
  if (!databaseUrl) return;
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/stocksembly_news_test" ||
    url.search
  )
    throw new Error(
      "News tests require isolated local stocksembly_news_test database",
    );
  pool = new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=research,pg_catalog",
  });
  await pool.query("CREATE SCHEMA IF NOT EXISTS research");
  await pool.query(
    await readFile(
      "src/research/server/persistence/postgres/migrations/002_news_ledger.sql",
      "utf8",
    ),
  );
  await pool.query(
    "TRUNCATE research.news_events, research.news_candidate_classifications",
  );
});
afterAll(async () => {
  if (pool) await pool.end();
});

test("fixtures without persistence remain database-free", async () => {
  expect(
    await readNewsEventLedger({ symbol: "NVDA", from: now, to: now }),
  ).toEqual([]);
  await writeNewsEventLedger({
    symbol: "NVDA",
    observedAt: now,
    events: [event],
    excerpts: [],
  });
});

integration(
  "upserts concurrently without losing excerpts, preserves directions and symbol isolation",
  async () => {
    const write = (events: readonly NewsEventCard[]) =>
      writeNewsEventLedger({
        pool,
        symbol: "NVDA",
        observedAt: now,
        events,
        excerpts: [],
      });
    await writeNewsEventLedger({
      pool,
      symbol: "NVDA",
      observedAt: now,
      events: [{ ...event, source: "filing" }],
      excerpts: [{ eventKey: event.eventKey, content: "Revenue increased" }],
    });
    await Promise.all([
      write([event]),
      write([{ ...event, direction: "negative" }]),
    ]);
    const rows = await readNewsEventLedger({
      pool,
      symbol: "NVDA",
      from: now,
      to: now,
    });
    expect(rows).toHaveLength(2);
    expect(
      rows.find((row) => row.event.direction === "positive"),
    ).toMatchObject({
      event: { source: "filing" },
      excerpt: { content: "Revenue increased" },
    });
    expect(
      await readNewsEventLedger({ pool, symbol: "MSFT", from: now, to: now }),
    ).toEqual([]);
    await writeNewsEventLedger({
      pool,
      symbol: "NVDA",
      observedAt: now,
      events: [
        { ...event, eventKey: "old", publishedAt: "2020-01-01T00:00:00.000Z" },
      ],
      excerpts: [],
    });
    expect(
      (
        await pool.query(
          "SELECT * FROM research.news_events WHERE event_key='old'",
        )
      ).rows,
    ).toEqual([]);
  },
);

integration(
  "classification cache updates decisions and rolls back a partially invalid batch",
  async () => {
    const input = {
      pool,
      symbol: "NVDA",
      classifiedAt: now,
      publishedAtByCandidateId: new Map([[classification.candidateId, now]]),
    };
    await writeNewsCandidateClassifications({
      ...input,
      detailed: [classification],
      screenedOut: [],
    });
    await writeNewsCandidateClassifications({
      ...input,
      detailed: [],
      screenedOut: [classification],
    });
    expect(
      await readNewsCandidateClassifications({
        pool,
        symbol: "NVDA",
        candidateIds: ["candidate", "unknown"],
      }),
    ).toEqual([
      { candidateId: "candidate", status: "screened_out", classification },
    ]);
    await pool.query(
      "ALTER TABLE research.news_candidate_classifications ADD CONSTRAINT reject_probe CHECK (candidate_id <> 'reject')",
    );
    try {
      await expect(
        writeNewsCandidateClassifications({
          ...input,
          detailed: [
            { ...classification, candidateId: "rollback" },
            { ...classification, candidateId: "reject" },
          ],
          screenedOut: [],
        }),
      ).rejects.toThrow();
      expect(
        await readNewsCandidateClassifications({
          pool,
          symbol: "NVDA",
          candidateIds: ["rollback"],
        }),
      ).toEqual([]);
    } finally {
      await pool.query(
        "ALTER TABLE research.news_candidate_classifications DROP CONSTRAINT reject_probe",
      );
    }
  },
);
