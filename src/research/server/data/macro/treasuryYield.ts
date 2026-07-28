import { createHash } from "node:crypto";
import { z } from "zod";
import { withCacheFillLock } from "../cacheFillLock";
import {
  MACRO_MAX_ATTEMPTS,
  MACRO_REQUEST_TIMEOUT_MILLISECONDS,
  type MacroClock,
  type MacroHttpTransport,
  type MacroProvenance,
  retryDelay,
  UNAVAILABLE_RELEASE_TIME,
  type UnavailableReleaseTime,
} from "./macroHttp";
import {
  readTreasuryYieldCache,
  writeTreasuryYieldCache,
} from "./treasuryYieldStore";

export type { MacroHttpTransport } from "./macroHttp";

export const TREASURY_YIELD_TENORS = [
  "1 Mo",
  "1.5 Month",
  "2 Mo",
  "3 Mo",
  "4 Mo",
  "6 Mo",
  "1 Yr",
  "2 Yr",
  "3 Yr",
  "5 Yr",
  "7 Yr",
  "10 Yr",
  "20 Yr",
  "30 Yr",
] as const;

type TreasuryTenor = (typeof TREASURY_YIELD_TENORS)[number];
export const TREASURY_YIELD_HEADER = `Date,${TREASURY_YIELD_TENORS.map(
  (tenor) => JSON.stringify(tenor),
).join(",")}`;

const TreasuryRequestSchema = z
  .object({ year: z.number().int().min(1990).max(2100) })
  .strict();

export type TreasuryCurveRow = {
  readonly observationDate: string;
  readonly tenors: Readonly<Record<TreasuryTenor, string | null>>;
  readonly missingMarkers?: Readonly<Partial<Record<TreasuryTenor, string>>>;
};

export type TreasuryAvailable = {
  readonly status: "available";
  readonly request: { readonly year: number };
  readonly curve: readonly TreasuryCurveRow[];
  readonly releaseTime: UnavailableReleaseTime;
  readonly provenance: MacroProvenance;
};

export type TreasuryDegraded = {
  readonly status: "degraded";
  readonly reason: string;
  readonly expectedHeader?: string;
  readonly receivedHeader?: string;
  readonly latestObservationDate?: string;
};

export type TreasuryCollection = TreasuryAvailable | TreasuryDegraded;

export type TreasuryYieldAdapter = {
  readonly collect: (request: unknown) => Promise<TreasuryCollection>;
};

type TreasuryYieldAdapterOptions = {
  readonly dataRoot?: string;
  readonly transport: MacroHttpTransport;
  readonly clock: MacroClock;
};

const TREASURY_CACHE_TTL_MILLISECONDS = 30 * 60_000;

export function treasuryYieldSourceUrl(year: number): string {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
}

function isoDate(raw: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (match === null) return undefined;
  const month = match[1];
  const day = match[2];
  const year = match[3];
  if (month === undefined || day === undefined || year === undefined)
    return undefined;
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? value : undefined;
}

function parseTenors(cells: readonly string[]):
  | {
      readonly ok: true;
      readonly tenors: Readonly<Record<TreasuryTenor, string | null>>;
      readonly missingMarkers?: Readonly<
        Partial<Record<TreasuryTenor, string>>
      >;
    }
  | { readonly ok: false } {
  const tenors: Partial<Record<TreasuryTenor, string | null>> = {};
  const missing: Partial<Record<TreasuryTenor, string>> = {};
  for (let index = 0; index < TREASURY_YIELD_TENORS.length; index += 1) {
    const tenor = TREASURY_YIELD_TENORS[index];
    const raw = cells[index + 1];
    if (tenor === undefined || raw === undefined) return { ok: false };
    if (raw === "" || raw === "-") {
      tenors[tenor] = null;
      missing[tenor] = raw;
      continue;
    }
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return { ok: false };
    tenors[tenor] = raw;
  }
  const complete = z
    .record(z.enum(TREASURY_YIELD_TENORS), z.string().nullable())
    .safeParse(tenors);
  if (!complete.success) return { ok: false };
  return Object.keys(missing).length === 0
    ? { ok: true, tenors: Object.freeze(complete.data) }
    : {
        ok: true,
        tenors: Object.freeze(complete.data),
        missingMarkers: Object.freeze(missing),
      };
}

function parseCsv(
  body: string,
  year: number,
  retrievedAt: string,
): TreasuryCollection {
  const lines = body
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  const receivedHeader = lines[0];
  if (receivedHeader !== TREASURY_YIELD_HEADER) {
    return {
      status: "degraded",
      reason: "schema_drift",
      expectedHeader: TREASURY_YIELD_HEADER,
      receivedHeader: receivedHeader ?? "",
    };
  }
  const curve: TreasuryCurveRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== TREASURY_YIELD_TENORS.length + 1)
      return { status: "degraded", reason: "payload_invalid" };
    const first = cells[0];
    const observationDate = first === undefined ? undefined : isoDate(first);
    const tenors = parseTenors(cells);
    if (observationDate === undefined || !tenors.ok)
      return { status: "degraded", reason: "payload_invalid" };
    curve.push(
      Object.freeze({
        observationDate,
        tenors: tenors.tenors,
        ...(tenors.missingMarkers === undefined
          ? {}
          : { missingMarkers: tenors.missingMarkers }),
      }),
    );
  }
  if (curve.length === 0)
    return { status: "degraded", reason: "data_unavailable" };
  const latestObservationDate = curve.reduce(
    (latest, row) =>
      row.observationDate > latest ? row.observationDate : latest,
    "0000-00-00",
  );
  const age =
    Date.parse(retrievedAt) -
    Date.parse(`${latestObservationDate}T00:00:00.000Z`);
  if (age > 10 * 86_400_000) {
    return { status: "degraded", reason: "stale_data", latestObservationDate };
  }
  return Object.freeze({
    status: "available",
    request: Object.freeze({ year }),
    curve: Object.freeze(curve),
    releaseTime: UNAVAILABLE_RELEASE_TIME,
    provenance: Object.freeze({
      sourceUrl: treasuryYieldSourceUrl(year),
      retrievedAt,
      contentHash: createHash("sha256").update(body).digest("hex"),
      freshness: "fresh",
    }),
  });
}

async function retrieve(
  options: TreasuryYieldAdapterOptions,
  year: number,
): Promise<TreasuryCollection> {
  const now = Date.parse(options.clock.isoNow());
  if (options.dataRoot !== undefined) {
    const cached = await readTreasuryYieldCache(options.dataRoot, year, now);
    if (cached !== undefined)
      return parseCsv(cached.body, year, cached.retrievedAt);
    return await withCacheFillLock({
      dataRoot: options.dataRoot,
      namespace: "treasury",
      key: String(year),
      operation: async () => {
        const filled = await readTreasuryYieldCache(
          options.dataRoot ?? "",
          year,
          Date.parse(options.clock.isoNow()),
        );
        if (filled !== undefined)
          return parseCsv(filled.body, year, filled.retrievedAt);
        return await retrieveAndCache(options, year);
      },
    });
  }
  return await retrieveAndCache(options, year);
}

async function retrieveAndCache(
  options: TreasuryYieldAdapterOptions,
  year: number,
): Promise<TreasuryCollection> {
  options.clock.isoNow();
  const sourceUrl = treasuryYieldSourceUrl(year);
  for (let attempt = 1; attempt <= MACRO_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await options.transport({
        url: sourceUrl,
        method: "GET",
        headers: { accept: "text/csv" },
        timeoutMilliseconds: MACRO_REQUEST_TIMEOUT_MILLISECONDS,
      });
      if (response.status >= 500 && attempt < MACRO_MAX_ATTEMPTS) {
        await options.clock.sleep(retryDelay(attempt));
        continue;
      }
      if (response.status !== 200)
        return { status: "degraded", reason: "transport_unavailable" };
      const retrievedAt = options.clock.isoNow();
      const parsed = parseCsv(response.body, year, retrievedAt);
      if (parsed.status === "available" && options.dataRoot !== undefined) {
        await writeTreasuryYieldCache({
          dataRoot: options.dataRoot,
          year,
          body: response.body,
          retrievedAt,
          expiresAt: new Date(
            Date.parse(retrievedAt) + TREASURY_CACHE_TTL_MILLISECONDS,
          ).toISOString(),
        });
      }
      return parsed;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (attempt === MACRO_MAX_ATTEMPTS)
        return { status: "degraded", reason: "transport_unavailable" };
      await options.clock.sleep(retryDelay(attempt));
    }
  }
  return { status: "degraded", reason: "transport_unavailable" };
}

export function createTreasuryYieldAdapter(
  options: TreasuryYieldAdapterOptions,
): TreasuryYieldAdapter {
  return Object.freeze({
    collect: async (input: unknown): Promise<TreasuryCollection> => {
      const parsed = TreasuryRequestSchema.safeParse(input);
      return parsed.success
        ? retrieve(options, parsed.data.year)
        : { status: "degraded", reason: "request_invalid" };
    },
  });
}

export function sealTreasuryCollection(
  collection: TreasuryCollection,
  evidenceCutoffAt: string,
):
  | {
      readonly status: "sealed";
      readonly evidenceCutoffAt: string;
      readonly collection: TreasuryAvailable;
    }
  | TreasuryDegraded {
  if (collection.status === "degraded") return collection;
  if (
    Date.parse(collection.provenance.retrievedAt) > Date.parse(evidenceCutoffAt)
  )
    return { status: "degraded", reason: "retrieved_after_cutoff" };
  return Object.freeze({ status: "sealed", evidenceCutoffAt, collection });
}
