import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  prepareArtifactPaths,
  resolveStocksemblyDataDirectory,
} from "../../research/server/artifacts/filesystemArtifactPaths";
import { createInsightSentryClient } from "../../research/server/data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../../research/server/data/insightsentry/insightSentryConfig";
import { createInsightSentryMarket } from "../../research/server/data/insightsentry/insightSentryMarket";
import type {
  BriefingEditionPayload,
  BriefingWatchlistItem,
} from "../domain/contracts";
import { createBriefingDataCollector } from "../server/briefingDataCollector";
import { synthesizeBriefingEdition } from "../server/briefingSynthesizer";
import {
  type BriefingPreviewEdition,
  selectBriefingPreviewHistory,
} from "./briefingPreviewHistory";

function marketDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function main() {
  if (process.env["NODE_ENV"] === "production")
    throw new TypeError("Local briefing preview is disabled in production");
  const symbols = (
    process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["NVDA", "AAPL"]
  )
    .filter((value) => value !== "--")
    .map((value) => value.trim().toUpperCase());
  const paths = await prepareArtifactPaths(resolveStocksemblyDataDirectory());
  const client = createInsightSentryClient({
    configuration: loadInsightSentryConfig(),
    dataRoot: paths.root,
  });
  const market = createInsightSentryMarket(client);
  const collector = createBriefingDataCollector({ dataRoot: paths.root });
  const now = new Date();
  const cutoffAt = now.toISOString();
  const date = marketDate(now);
  const outputDirectory = join(process.cwd(), ".artifacts");
  const output = join(outputDirectory, "briefing-local-preview.json");
  const previousEditions = await readFile(output, "utf8")
    .then(
      (raw) =>
        (
          JSON.parse(raw) as {
            readonly editions?: readonly {
              readonly briefingId: string;
              readonly item: BriefingWatchlistItem;
              readonly payload: BriefingEditionPayload;
            }[];
          }
        ).editions ?? [],
    )
    .catch(() => []);
  const editions: BriefingPreviewEdition[] = [];

  for (const symbol of symbols) {
    const candidates = await market.searchSymbols(symbol);
    const candidate = candidates.find(
      (value) => value.symbol === symbol && value.status === "active",
    );
    if (candidate === undefined)
      throw new RangeError(`No supported US equity found for ${symbol}`);
    const item: BriefingWatchlistItem = Object.freeze({
      symbol: candidate.symbol,
      providerCode: candidate.providerCode,
      company: candidate.company,
      exchange: candidate.exchange,
      position: editions.length,
      createdAt: cutoffAt,
    });
    const briefingId = randomUUID();
    const history = selectBriefingPreviewHistory(previousEditions, {
      symbol,
      locale: "ko",
      marketDate: date,
      excludedBriefingId: briefingId,
    });
    const previous = history[0]?.payload;
    const latestBriefingAt = history[0]?.payload.cutoffAt;
    const snapshot = await collector.collect({
      item,
      marketDate: date,
      cutoffAt,
      previousEventKeys: [
        ...new Set(
          history.flatMap((edition) =>
            edition.payload.materialChanges.map((signal) => signal.id),
          ),
        ),
      ],
      ...(latestBriefingAt === undefined
        ? {}
        : { previousBriefingAt: latestBriefingAt }),
    });
    const payload = await synthesizeBriefingEdition({
      locale: "ko",
      snapshot,
      ...(previous === undefined ? {} : { previous }),
      generatedAt: new Date().toISOString(),
    });
    editions.push({ briefingId, item, payload });
    process.stdout.write(
      `${JSON.stringify({
        symbol,
        status: payload.status,
        earnings: payload.earnings,
        events: payload.upcomingEvents.length,
        changes: payload.materialChanges.length,
      })}\n`,
    );
  }

  await mkdir(outputDirectory, { recursive: true });
  const history = [...editions, ...previousEditions]
    .sort(
      (left, right) =>
        Date.parse(right.payload.generatedAt) -
        Date.parse(left.payload.generatedAt),
    )
    .slice(0, 90);
  await writeFile(
    output,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), editions: history }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({ output })}\n`);
}

await main();
