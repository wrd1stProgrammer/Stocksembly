import type { Locale } from "../../lib/i18n";
import type {
  BriefingEditionPayload,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import {
  localizeBriefingDraft,
  normalizeEstimatedBriefingLanguage,
  repairBriefingDraft,
} from "./briefingDraftRepair";
import { assembleBriefingEdition } from "./briefingEditionAssembler";
import { fallbackBriefingDraft } from "./briefingFallbackDraft";
import { generateBriefingDraft } from "./briefingModelRunner";
import { novelBriefingSignals } from "./briefingSignalPolicy";
import type { BriefingDraft } from "./briefingSynthesisSchema";

export type SynthesizeBriefingEditionInput = {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly previous?: BriefingEditionPayload;
  readonly generatedAt: string;
};

export async function runBriefingSynthesis(
  input: SynthesizeBriefingEditionInput,
): Promise<BriefingEditionPayload> {
  const signals = novelBriefingSignals(input.snapshot, input.previous);
  const fallback = fallbackBriefingDraft({
    locale: input.locale,
    snapshot: input.snapshot,
    signals,
    previous: input.previous,
  });
  let draft: BriefingDraft;
  let modelFailed = false;
  try {
    draft = await generateBriefingDraft({
      locale: input.locale,
      snapshot: input.snapshot,
      signals,
      previous: input.previous,
    });
  } catch (error) {
    modelFailed = true;
    // biome-ignore lint/complexity/useLiteralKeys: worker env typing uses an index signature.
    if (process.env["NODE_ENV"] !== "production")
      console.error("BRIEFING_SYNTHESIS_FALLBACK", error);
    draft = fallback;
  }
  const repaired = localizeBriefingDraft(
    input.locale,
    repairBriefingDraft(draft, fallback),
    input.snapshot.symbol,
  );
  const normalized = normalizeEstimatedBriefingLanguage(
    input.locale,
    repaired,
    input.snapshot,
  );
  return assembleBriefingEdition({
    locale: input.locale,
    snapshot: input.snapshot,
    ...(input.previous === undefined ? {} : { previous: input.previous }),
    generatedAt: input.generatedAt,
    signals,
    draft: normalized,
    fallback,
    modelFailed,
  });
}
