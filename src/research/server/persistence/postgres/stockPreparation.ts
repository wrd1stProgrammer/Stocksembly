import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { OnboardingStock } from "../../../../accounts/onboardingInterests";
import { type ResearchDatabase, researchTransaction } from "./database";

export async function saveOnboardingInterests(
  database: ResearchDatabase,
  principalId: string,
  stocks: readonly OnboardingStock[],
) {
  return researchTransaction(database, async (client) => {
    // Lock the account so concurrent Next clicks cannot spend multiple preparation budgets.
    await client.query(
      "SELECT principal_id FROM public.app_users WHERE principal_id=$1 FOR UPDATE",
      [principalId],
    );
    const prior = await client.query<{ stocks: OnboardingStock[] }>(
      "SELECT stocks FROM public.onboarding_interests WHERE principal_id=$1",
      [principalId],
    );
    if (prior.rows[0]) return prior.rows[0].stocks;
    await client.query(
      "INSERT INTO public.onboarding_interests(principal_id,stocks) VALUES($1,$2)",
      [principalId, JSON.stringify(stocks)],
    );
    for (const stock of [...stocks].sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    )) {
      await client.query(
        `INSERT INTO stock_preparations(symbol) VALUES($1)
        ON CONFLICT(symbol) DO UPDATE SET status='queued', attempts=0, requested_at=now(),
          available_at=now(), lease_token=NULL, lease_until=NULL, error_code=NULL
        WHERE stock_preparations.status IN ('ready','failed')
          AND (stock_preparations.expires_at IS NULL OR stock_preparations.expires_at <= now())`,
        [stock.symbol],
      );
    }
    return stocks;
  });
}

export async function claimStockPreparation(
  database: ResearchDatabase,
  symbol?: string,
) {
  return researchTransaction(database, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(1937010547, 72)");
    await client.query(
      "UPDATE stock_preparations SET status='failed', error_code='LEASE_EXHAUSTED' WHERE status='running' AND lease_until <= now() AND attempts >= 2",
    );
    const active = await client.query(
      "SELECT 1 FROM stock_preparations WHERE status='running' AND lease_until > now() LIMIT 1",
    );
    if (active.rowCount) return undefined;
    if (!symbol) {
      const research = await client.query(
        "SELECT 1 FROM runs WHERE status IN ('queued','running') LIMIT 1",
      );
      if (research.rowCount) return undefined;
    }
    const token = randomUUID();
    const claimed = await client.query<{ symbol: string; lease_token: string }>(
      `UPDATE stock_preparations
      SET status='running', lease_token=$1, lease_until=now()+interval '90 seconds',
          started_at=now(), attempts=attempts+1
      WHERE symbol=(SELECT symbol FROM stock_preparations
        WHERE (($2::text IS NULL) OR symbol=$2)
          AND attempts < 2 AND available_at <= now()
          AND (status='queued' OR (status='running' AND lease_until <= now()))
        ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING symbol,lease_token`,
      [token, symbol ?? null],
    );
    if (claimed.rowCount)
      await client.query(
        "DELETE FROM shared_source_cache WHERE (namespace,cache_key) IN (SELECT namespace,cache_key FROM shared_source_cache WHERE expires_at <= now() LIMIT 100)",
      );
    return claimed.rows[0];
  });
}

export async function finishStockPreparation(
  database: ResearchDatabase,
  symbol: string,
  token: string,
  success: boolean,
) {
  await database.query(
    `UPDATE stock_preparations SET
    status=CASE WHEN $3 THEN 'ready' WHEN attempts < 2 THEN 'queued' ELSE 'failed' END,
    finished_at=now(), lease_until=NULL, lease_token=NULL,
    expires_at=now()+interval '15 minutes',
    available_at=now()+interval '30 seconds', error_code=CASE WHEN $3 THEN NULL ELSE 'COLLECTION_FAILED' END
    WHERE symbol=$1 AND lease_token=$2`,
    [symbol, token, success],
  );
}

export async function waitForStockPreparation(input: {
  database: ResearchDatabase;
  symbol: string;
  signal: AbortSignal;
  activity: () => void;
  onWaiting: () => Promise<void>;
  maxWaitMs?: number;
  pollMs?: number;
}): Promise<"ready" | "fallback" | "missing"> {
  const deadline = Date.now() + (input.maxWaitMs ?? 12 * 60_000);
  let announced = false;
  while (!input.signal.aborted) {
    const result = await input.database.query<{
      status: string;
      alive: boolean;
    }>(
      `SELECT status, lease_until > now() AS alive FROM stock_preparations WHERE symbol=$1`,
      [input.symbol],
    );
    const row = result.rows[0];
    if (!row) return "missing";
    if (row.status === "ready") return "ready";
    // A queued, failed or abandoned optional preparation must not hold up paid research.
    if (row.status === "queued") {
      const bypass = await input.database.query(
        "UPDATE stock_preparations SET status='failed', error_code='RESEARCH_COLLECTING' WHERE symbol=$1 AND status='queued'",
        [input.symbol],
      );
      if (!bypass.rowCount) continue;
      return "fallback";
    }
    if (row.status !== "running" || !row.alive || Date.now() >= deadline)
      return "fallback";
    if (!announced) {
      await input.onWaiting();
      announced = true;
    }
    input.activity();
    await delay(input.pollMs ?? 2000, undefined, { signal: input.signal });
  }
  input.signal.throwIfAborted();
  return "fallback";
}
