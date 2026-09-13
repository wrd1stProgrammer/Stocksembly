import { z } from "zod";
import type { ResearchDatabase } from "../../persistence/postgres/database";
import { researchTransaction } from "../../persistence/postgres/database";
import { getResearchPool } from "../../persistence/postgres/researchPool";
import type { InsightSentrySymbol } from "./insightSentryMarket";

const RegistryRowSchema = z.strictObject({
  provider_code: z.string().min(3).max(64),
  user_ticker: z.string().min(1).max(24),
  exchange: z.enum(["NASDAQ", "NYSE", "NYSE_AMERICAN"]),
  security_type: z.string().min(1).max(64),
  currency: z.string().length(3),
  name: z.string().min(1).max(512),
  status: z.enum(["active", "delisted", "unsupported"]),
  aliases_json: z.string().min(2),
});
const AliasesSchema = z.array(z.string().min(1).max(512)).max(64);

export type SymbolRegistryResolution =
  | { readonly kind: "resolved"; readonly symbol: InsightSentrySymbol }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "missing" };

export interface SymbolRegistry {
  readonly search: (query: string) => Promise<readonly InsightSentrySymbol[]>;
  readonly resolve: (alias: string) => Promise<SymbolRegistryResolution>;
  readonly upsert: (
    symbol: InsightSentrySymbol,
    verifiedAt: string,
  ) => Promise<void>;
  readonly close: () => void;
}

function normalizedAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function symbolFromRow(input: unknown): InsightSentrySymbol {
  const row = RegistryRowSchema.parse(input);
  return Object.freeze({
    symbol: row.user_ticker,
    providerCode: row.provider_code,
    company: row.name,
    exchange: row.exchange,
    securityType: row.security_type,
    currency: row.currency,
    status: row.status,
    aliases: Object.freeze(AliasesSchema.parse(JSON.parse(row.aliases_json))),
  });
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export async function openSymbolRegistry(
  database?: ResearchDatabase,
): Promise<SymbolRegistry> {
  const pool = database ?? (await getResearchPool());
  const columns = `provider_code, user_ticker, exchange, security_type,
    currency, name, status, aliases_json`;
  return Object.freeze({
    async search(query: string) {
      const normalized = normalizedAlias(query);
      if (!normalized) return [];
      const rows = await pool.query(
        `SELECT DISTINCT ${columns} FROM symbol_registry
        LEFT JOIN symbol_registry_aliases USING(provider_code)
        WHERE normalized_alias LIKE $1 ESCAPE '\\'
          OR lower(name) LIKE $1 ESCAPE '\\'
          OR lower(user_ticker) LIKE $1 ESCAPE '\\'
        ORDER BY user_ticker, provider_code LIMIT 20`,
        [`%${escapeLike(normalized)}%`],
      );
      return Object.freeze(
        rows.rows
          .map(symbolFromRow)
          .sort(
            (a, b) =>
              Number(b.symbol.toLowerCase() === normalized) -
              Number(a.symbol.toLowerCase() === normalized),
          ),
      );
    },
    async resolve(alias: string): Promise<SymbolRegistryResolution> {
      const normalized = normalizedAlias(alias);
      if (!normalized) return { kind: "missing" };
      const rows = await pool.query(
        `SELECT ${columns} FROM symbol_registry
        JOIN symbol_registry_aliases USING(provider_code)
        WHERE normalized_alias = $1 ORDER BY provider_code`,
        [normalized],
      );
      const matches = rows.rows.map(symbolFromRow);
      const active = matches.filter((match) => match.status === "active");
      if (active.length > 1) return { kind: "ambiguous" };
      const resolved = active[0];
      return resolved
        ? { kind: "resolved", symbol: resolved }
        : { kind: matches.length ? "unsupported" : "missing" };
    },
    async upsert(symbol: InsightSentrySymbol, verifiedAt: string) {
      await researchTransaction(pool, async (client) => {
        const aliases = [
          ...new Set([
            symbol.symbol,
            symbol.providerCode,
            symbol.company,
            ...symbol.aliases,
          ]),
        ];
        await client.query(
          `INSERT INTO symbol_registry(
          provider_code, user_ticker, exchange, security_type, currency, name,
          status, aliases_json, last_verified_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(provider_code) DO UPDATE SET user_ticker=excluded.user_ticker,
            exchange=excluded.exchange, security_type=excluded.security_type,
            currency=excluded.currency, name=excluded.name, status=excluded.status,
            aliases_json=excluded.aliases_json, last_verified_at=excluded.last_verified_at`,
          [
            symbol.providerCode,
            symbol.symbol,
            symbol.exchange,
            symbol.securityType,
            symbol.currency,
            symbol.company,
            symbol.status,
            JSON.stringify(aliases),
            verifiedAt,
          ],
        );
        await client.query(
          "DELETE FROM symbol_registry_aliases WHERE provider_code=$1",
          [symbol.providerCode],
        );
        for (const alias of aliases) {
          const normalized = normalizedAlias(alias);
          if (normalized)
            await client.query(
              `INSERT INTO symbol_registry_aliases(normalized_alias,provider_code)
            VALUES($1,$2) ON CONFLICT DO NOTHING`,
              [normalized, symbol.providerCode],
            );
        }
      });
    },
    close() {},
  });
}
