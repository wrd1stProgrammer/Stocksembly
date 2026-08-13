import { randomUUID } from "node:crypto";
import type { AccountStore } from "../../accounts/server/accountStore";
import type { Locale } from "../../lib/i18n";
import type {
  BriefingAudience,
  BriefingEditionPayload,
} from "../domain/contracts";
import { dueUsMarketDate } from "../domain/marketCalendar";
import {
  type BriefingDataCollector,
  createBriefingDataCollector,
} from "./briefingDataCollector";
import { synthesizeBriefingEdition } from "./briefingSynthesizer";

type BriefingWorkerStore = AccountStore &
  Required<
    Pick<
      AccountStore,
      | "listBriefingAudience"
      | "listBriefingEditionKeys"
      | "saveBriefingSourceSnapshot"
      | "findPreviousBriefingEdition"
      | "listBriefingEventKeys"
      | "saveBriefingEdition"
    >
  >;

export type BriefingCycleResult = {
  readonly marketDate: string;
  readonly audienceCount: number;
  readonly symbols: number;
  readonly editions: number;
  readonly skipped: number;
  readonly failures: readonly string[];
};

function isBriefingWorkerStore(
  store: AccountStore,
): store is BriefingWorkerStore {
  return (
    store.listBriefingAudience !== undefined &&
    store.listBriefingEditionKeys !== undefined &&
    store.saveBriefingSourceSnapshot !== undefined &&
    store.findPreviousBriefingEdition !== undefined &&
    store.listBriefingEventKeys !== undefined &&
    store.saveBriefingEdition !== undefined
  );
}

function groupAudience(audience: readonly BriefingAudience[]) {
  const grouped = new Map<string, BriefingAudience[]>();
  for (const member of audience) {
    const members = grouped.get(member.item.symbol) ?? [];
    members.push(member);
    grouped.set(member.item.symbol, members);
  }
  return grouped;
}

function languageRecipients(members: readonly BriefingAudience[]) {
  const grouped = new Map<Locale, string[]>();
  for (const member of members) {
    const recipients = grouped.get(member.locale) ?? [];
    recipients.push(member.principalId);
    grouped.set(member.locale, recipients);
  }
  return grouped;
}

function previousEventKeys(
  editions: readonly (BriefingEditionPayload | undefined)[],
): readonly string[] {
  return [
    ...new Set(
      editions.flatMap(
        (edition) => edition?.materialChanges.map((signal) => signal.id) ?? [],
      ),
    ),
  ];
}

function previousBriefingAt(
  editions: readonly (BriefingEditionPayload | undefined)[],
): string | undefined {
  return editions
    .flatMap((edition) => (edition === undefined ? [] : [edition.cutoffAt]))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

export async function runBriefingCycle(input: {
  readonly store: BriefingWorkerStore;
  readonly collector: BriefingDataCollector;
  readonly marketDate: string;
  readonly scheduledFor: string;
  readonly now?: () => string;
  readonly synthesize?: typeof synthesizeBriefingEdition;
  readonly forceSymbols?: readonly string[];
}): Promise<BriefingCycleResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const synthesize = input.synthesize ?? synthesizeBriefingEdition;
  const audience = await input.store.listBriefingAudience();
  const existing = await input.store.listBriefingEditionKeys(input.marketDate);
  const grouped = groupAudience(audience);
  let editions = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const [symbol, members] of grouped) {
    const firstMember = members[0];
    if (firstMember === undefined) continue;
    const recipientsByLocale = languageRecipients(members);
    const force = input.forceSymbols?.includes(symbol) ?? false;
    const missingLocales = [...recipientsByLocale.keys()].filter(
      (locale) => force || !existing.has(`${symbol}:${locale}`),
    );
    skipped += recipientsByLocale.size - missingLocales.length;
    if (missingLocales.length === 0) continue;
    try {
      const [previous, historicalEventKeys] = await Promise.all([
        Promise.all(
          missingLocales.map(
            async (locale) =>
              await input.store.findPreviousBriefingEdition(
                symbol,
                locale,
                input.marketDate,
              ),
          ),
        ),
        Promise.all(
          missingLocales.map(
            async (locale) =>
              await input.store.listBriefingEventKeys(
                symbol,
                locale,
                input.marketDate,
                90,
              ),
          ),
        ),
      ]);
      const priorBriefingAt = previousBriefingAt(previous);
      const snapshot = await input.collector.collect({
        item: firstMember.item,
        marketDate: input.marketDate,
        cutoffAt: now(),
        previousEventKeys: [
          ...new Set([
            ...historicalEventKeys.flat(),
            ...previousEventKeys(previous),
          ]),
        ],
        ...(priorBriefingAt === undefined
          ? {}
          : { previousBriefingAt: priorBriefingAt }),
      });
      const snapshotId = await input.store.saveBriefingSourceSnapshot(snapshot);
      const localized = await Promise.all(
        missingLocales.map(async (locale, index) => ({
          locale,
          payload: await synthesize({
            locale,
            snapshot,
            ...(previous[index] === undefined
              ? {}
              : { previous: previous[index] }),
            generatedAt: now(),
          }),
        })),
      );
      for (const edition of localized) {
        await input.store.saveBriefingEdition(
          {
            briefingId: randomUUID(),
            symbol,
            company: snapshot.company,
            marketDate: input.marketDate,
            locale: edition.locale,
            scheduledFor: input.scheduledFor,
            snapshotId,
            payload: edition.payload,
          },
          recipientsByLocale.get(edition.locale) ?? [],
        );
        editions += 1;
      }
    } catch (error) {
      failures.push(
        `${symbol}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  return {
    marketDate: input.marketDate,
    audienceCount: audience.length,
    symbols: grouped.size,
    editions,
    skipped,
    failures: Object.freeze(failures),
  };
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

export function createBriefingScheduler(input: {
  readonly store: AccountStore;
  readonly dataRoot: string;
  readonly now?: () => Date;
  readonly intervalMs?: number;
}) {
  if (!isBriefingWorkerStore(input.store)) return undefined;
  const store = input.store;
  const collector = createBriefingDataCollector({ dataRoot: input.dataRoot });
  const now = input.now ?? (() => new Date());
  const intervalMs = input.intervalMs ?? 60_000;
  return {
    async tick(): Promise<BriefingCycleResult | undefined> {
      const current = now();
      const due = dueUsMarketDate(current);
      if (due === undefined) return undefined;
      return await runBriefingCycle({
        store,
        collector,
        marketDate: due.marketDate,
        scheduledFor: due.scheduledFor,
        now: () => current.toISOString(),
      });
    },
    async runForMarketDate(
      marketDate: string,
      scheduledFor = now().toISOString(),
      forceSymbols: readonly string[] = [],
    ): Promise<BriefingCycleResult> {
      return await runBriefingCycle({
        store,
        collector,
        marketDate,
        scheduledFor,
        now: () => now().toISOString(),
        forceSymbols,
      });
    },
    async runUntilStopped(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        try {
          const result = await this.tick();
          if (result !== undefined)
            process.stdout.write(
              `${JSON.stringify({ kind: "briefing_cycle", ...result })}\n`,
            );
        } catch (error) {
          process.stderr.write(
            `${JSON.stringify({
              kind: "briefing_cycle_error",
              message: error instanceof Error ? error.message : "unknown",
            })}\n`,
          );
        }
        await wait(intervalMs, signal);
      }
    },
  };
}
