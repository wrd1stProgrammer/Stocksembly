import Database from "better-sqlite3";
import { z } from "zod";
import { applyOrderedMigrations } from "../../persistence/sqlite/migrations";
import type { InsightSentrySymbol } from "./insightSentryMarket";

const RegistryRowSchema = z
  .strictObject({
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
  readonly search: (query: string) => readonly InsightSentrySymbol[];
  readonly resolve: (alias: string) => SymbolRegistryResolution;
  readonly upsert: (
    symbol: InsightSentrySymbol,
    verifiedAt: string,
  ) => void;
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
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function openSymbolRegistry(databasePath: string): SymbolRegistry {
  const database = new Database(databasePath, { timeout: 5_000 });
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");
  database.pragma("busy_timeout = 5000");
  applyOrderedMigrations(database);
  const columns = `provider_code, user_ticker, exchange, security_type,
    currency, name, status, aliases_json`;
  const findAliases = database.prepare<{ readonly alias: string }>(`
    SELECT ${columns} FROM symbol_registry
    JOIN symbol_registry_aliases USING(provider_code)
    WHERE normalized_alias = @alias
    ORDER BY provider_code`);
  const search = database.prepare<{ readonly pattern: string }>(`
    SELECT DISTINCT ${columns} FROM symbol_registry
    LEFT JOIN symbol_registry_aliases USING(provider_code)
    WHERE normalized_alias LIKE @pattern ESCAPE '\\'
       OR lower(name) LIKE @pattern ESCAPE '\\'
       OR lower(user_ticker) LIKE @pattern ESCAPE '\\'
    ORDER BY
      CASE WHEN lower(user_ticker) = trim(@pattern, '%') THEN 0 ELSE 1 END,
      user_ticker,
      provider_code
    LIMIT 20`);
  const upsertSymbol = database.prepare(`
    INSERT INTO symbol_registry(
      provider_code, user_ticker, exchange, security_type, currency,
      name, status, aliases_json, last_verified_at
    ) VALUES (
      @providerCode, @symbol, @exchange, @securityType, @currency,
      @company, @status, @aliasesJson, @lastVerifiedAt
    )
    ON CONFLICT(provider_code) DO UPDATE SET
      user_ticker = excluded.user_ticker,
      exchange = excluded.exchange,
      security_type = excluded.security_type,
      currency = excluded.currency,
      name = excluded.name,
      status = excluded.status,
      aliases_json = excluded.aliases_json,
      last_verified_at = excluded.last_verified_at`);
  const deleteAliases = database.prepare(
    "DELETE FROM symbol_registry_aliases WHERE provider_code = ?",
  );
  const insertAlias = database.prepare(`
    INSERT OR IGNORE INTO symbol_registry_aliases(normalized_alias, provider_code)
    VALUES (?, ?)`);
  const persist = database.transaction(
    (symbol: InsightSentrySymbol, verifiedAt: string) => {
      const aliases = Object.freeze([
        ...new Set([
          symbol.symbol,
          symbol.providerCode,
          symbol.company,
          ...symbol.aliases,
        ]),
      ]);
      upsertSymbol.run({
        providerCode: symbol.providerCode,
        symbol: symbol.symbol,
        exchange: symbol.exchange,
        securityType: symbol.securityType,
        currency: symbol.currency,
        company: symbol.company,
        status: symbol.status,
        aliasesJson: JSON.stringify(aliases),
        lastVerifiedAt: verifiedAt,
      });
      deleteAliases.run(symbol.providerCode);
      for (const alias of aliases) {
        const normalized = normalizedAlias(alias);
        if (normalized.length > 0) insertAlias.run(normalized, symbol.providerCode);
      }
    },
  );

  const registry: SymbolRegistry = {
    search: (query: string) => {
      const normalized = normalizedAlias(query);
      if (normalized.length === 0) return [];
      return Object.freeze(
        search
          .all({ pattern: `%${escapeLike(normalized)}%` })
          .map(symbolFromRow),
      );
    },
    resolve: (alias: string): SymbolRegistryResolution => {
      const normalized = normalizedAlias(alias);
      if (normalized.length === 0) return { kind: "missing" } as const;
      const matches = findAliases
        .all({ alias: normalized })
        .map(symbolFromRow);
      const active = matches.filter((match) => match.status === "active");
      if (active.length > 1) return { kind: "ambiguous" } as const;
      const resolved = active[0];
      if (resolved !== undefined)
        return { kind: "resolved", symbol: resolved } as const;
      return matches.length > 0
        ? ({ kind: "unsupported" } as const)
        : ({ kind: "missing" } as const);
    },
    upsert: persist,
    close: () => {
      if (database.open) database.close();
    },
  };
  return Object.freeze(registry);
}
