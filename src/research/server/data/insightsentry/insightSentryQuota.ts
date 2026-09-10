import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  InsightSentryQuotaObservationSchema,
  InsightSentryRetryIntentSchema,
  InsightSentryRetryStateSchema,
} from "./insightSentrySchemas";

export type InsightSentryQuotaObservation = {
  readonly observedAt: string;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt?: string;
};

export type InsightSentryRetryIntent = {
  readonly cacheKey: string;
  readonly classification:
    | "rate_limited"
    | "server_error"
    | "network"
    | "timeout";
  readonly retryAt: string;
  readonly ordinal: number;
  readonly endpoint: string;
  readonly status?: number;
};

function statePath(dataRoot: string, name: string): string {
  return join(dataRoot, "insightsentry", name);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readUnknown(path: string): Promise<unknown | undefined> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function atomicJson(dataRoot: string, name: string, value: unknown) {
  const directory = join(dataRoot, "insightsentry");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = statePath(dataRoot, name);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readInsightSentryQuotaObservation(
  dataRoot: string,
): Promise<InsightSentryQuotaObservation | undefined> {
  const parsed = InsightSentryQuotaObservationSchema.safeParse(
    await readUnknown(statePath(dataRoot, "quota-observation.json")),
  );
  if (!parsed.success) return undefined;
  return Object.freeze({
    observedAt: parsed.data.observedAt,
    limit: parsed.data.limit,
    remaining: parsed.data.remaining,
    ...(parsed.data.resetAt === undefined
      ? {}
      : { resetAt: parsed.data.resetAt }),
  });
}

export async function writeInsightSentryQuotaObservation(
  dataRoot: string,
  observation: InsightSentryQuotaObservation,
): Promise<void> {
  await atomicJson(
    dataRoot,
    "quota-observation.json",
    InsightSentryQuotaObservationSchema.parse(observation),
  );
}

async function retryIntents(
  dataRoot: string,
): Promise<readonly InsightSentryRetryIntent[]> {
  const parsed = InsightSentryRetryStateSchema.safeParse(
    await readUnknown(statePath(dataRoot, "retry-intents.json")),
  );
  return parsed.success ? parsed.data.intents.map(freezeIntent) : [];
}

function freezeIntent(
  intent: typeof InsightSentryRetryIntentSchema._output,
): InsightSentryRetryIntent {
  return Object.freeze({
    cacheKey: intent.cacheKey,
    classification: intent.classification,
    retryAt: intent.retryAt,
    ordinal: intent.ordinal,
    endpoint: intent.endpoint,
    ...(intent.status === undefined ? {} : { status: intent.status }),
  });
}

const updateQueues = new Map<string, Promise<void>>();

async function updateRetries(
  dataRoot: string,
  update: (
    current: readonly InsightSentryRetryIntent[],
  ) => readonly InsightSentryRetryIntent[],
): Promise<void> {
  const previous = updateQueues.get(dataRoot) ?? Promise.resolve();
  const next = previous.then(async () => {
    const intents = update(await retryIntents(dataRoot));
    await atomicJson(dataRoot, "retry-intents.json", { intents });
  });
  updateQueues.set(dataRoot, next);
  try {
    await next;
  } finally {
    if (updateQueues.get(dataRoot) === next) updateQueues.delete(dataRoot);
  }
}

export async function writeInsightSentryRetryIntent(
  dataRoot: string,
  intent: InsightSentryRetryIntent,
): Promise<void> {
  const parsed = InsightSentryRetryIntentSchema.parse(intent);
  await updateRetries(dataRoot, (current) => [
    ...current.filter((item) => item.cacheKey !== parsed.cacheKey),
    freezeIntent(parsed),
  ]);
}

export async function clearInsightSentryRetryIntent(
  dataRoot: string,
  cacheKey: string,
): Promise<void> {
  await updateRetries(dataRoot, (current) =>
    current.filter((item) => item.cacheKey !== cacheKey),
  );
}

export async function readInsightSentryRetryIntent(
  dataRoot: string,
  cacheKey: string,
): Promise<InsightSentryRetryIntent | undefined> {
  return (await retryIntents(dataRoot)).find(
    (intent) => intent.cacheKey === cacheKey,
  );
}

export class InsightSentryCooldownError extends Error {
  constructor(readonly retryAt: string) {
    super("rate_limited");
    this.name = "InsightSentryCooldownError";
  }
}

export class InsightSentryQuotaGovernor {
  private active = 0;
  private known = false;
  private cooldownUntil = 0;
  private throttled = false;
  private readonly waiting: Array<() => void> = [];
  private readonly hydrated: Promise<void>;

  constructor(private readonly dataRoot: string) {
    this.hydrated = Promise.all([
      readInsightSentryQuotaObservation(dataRoot),
      retryIntents(dataRoot),
    ]).then(([observation, intents]) => {
      this.known = observation !== undefined;
      for (const intent of intents)
        if (intent.classification === "rate_limited")
          this.coolDown(intent.retryAt);
    });
  }

  async run<T>(
    operation: () => Promise<T>,
    now: () => number = Date.now,
  ): Promise<T> {
    await this.hydrated;
    await this.acquire();
    try {
      if (this.cooldownUntil > now())
        throw new InsightSentryCooldownError(
          new Date(this.cooldownUntil).toISOString(),
        );
      return await operation();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  coolDown(retryAt: string): void {
    const until = Date.parse(retryAt);
    if (!Number.isFinite(until)) return;
    this.cooldownUntil = Math.max(this.cooldownUntil, until);
    this.throttled = true;
  }

  async observe(observation: InsightSentryQuotaObservation): Promise<void> {
    this.known = true;
    this.drain();
    await writeInsightSentryQuotaObservation(this.dataRoot, observation);
  }

  private async acquire(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    const limit = this.known && !this.throttled ? 2 : 1;
    while (this.active < limit) {
      const next = this.waiting.shift();
      if (next === undefined) return;
      this.active += 1;
      next();
    }
  }
}
