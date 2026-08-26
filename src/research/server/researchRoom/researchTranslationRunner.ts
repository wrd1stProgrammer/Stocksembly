import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import { productionCodexPlatform } from "../codex/codexPlatform";
import {
  type CommittedLaunchReservation,
  codexInputHash,
  type LaunchReservationClaim,
  type LaunchReservationReader,
} from "../codex/codexReservation";
import { createCodexPort } from "../codex/codexRunner";

export type ResearchTranslationLocale = "en" | "ko";

export type ResearchTranslationItem = {
  readonly id: string;
  readonly text: string;
};

const TranslationResponseSchema = z.object({
  translations: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
    }),
  ),
});

function translationPrompt(
  items: readonly ResearchTranslationItem[],
  targetLocale: ResearchTranslationLocale,
): string {
  const targetLanguage = targetLocale === "ko" ? "Korean" : "English";
  return [
    `Professionally translate the supplied US-equity research text into natural ${targetLanguage}.`,
    "Do not browse and do not add, remove, soften, or strengthen any investment claim.",
    "Preserve tickers, company names, numbers, currencies, dates, citation markers, and technical financial meaning exactly.",
    "Return exactly one translation for every id. The text must contain only the translated text, without commentary or quotation marks.",
    JSON.stringify({ targetLocale, items }, null, 2),
  ].join("\n\n");
}

export async function translateResearchText(
  items: readonly ResearchTranslationItem[],
  targetLocale: ResearchTranslationLocale,
): Promise<ReadonlyMap<string, string>> {
  if (items.length === 0) return new Map();
  const key = {
    runId: RunIdSchema.parse(randomUUID()),
    jobId: JobIdSchema.parse(randomUUID()),
    attemptId: AttemptIdSchema.parse(randomUUID()),
    ordinal: 1,
  };
  const fence = { ownerId: `research-translation:${process.pid}`, token: 1 };
  const reservation: LaunchReservationClaim = { key, fence };
  const prompt = translationPrompt(items, targetLocale);
  const inputHash = codexInputHash({
    stage: "memo",
    prompt,
    outputSchema: TranslationResponseSchema,
  });
  const committed: CommittedLaunchReservation = {
    ...key,
    status: "spawn_reserved",
    committed: true,
    inputHash,
    reservationFence: fence,
    currentFence: fence,
  };
  const reservations: LaunchReservationReader = {
    readCommittedReservation: async (candidate) =>
      candidate.runId === key.runId &&
      candidate.jobId === key.jobId &&
      candidate.attemptId === key.attemptId &&
      candidate.ordinal === key.ordinal
        ? committed
        : undefined,
  };
  const attemptDir = await mkdtemp(
    join(
      await realpath(productionCodexPlatform().tempParent),
      "stocksembly-translation-",
    ),
  );
  try {
    const result = await createCodexPort(reservations).run({
      attemptDir,
      reservation,
      stage: "memo",
      runtime: { model: "gpt-5.6-luna", reasoning: "low" },
      prompt,
      outputSchema: TranslationResponseSchema,
    });
    const translated = TranslationResponseSchema.parse(result.candidate);
    const byId = new Map(
      translated.translations.map((item) => [item.id, item.text.trim()]),
    );
    if (items.some((item) => !byId.has(item.id)))
      throw new TypeError("research_translation_incomplete");
    return byId;
  } finally {
    await rm(attemptDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}
