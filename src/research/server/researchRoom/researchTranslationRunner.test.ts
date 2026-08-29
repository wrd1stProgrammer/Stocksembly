import { describe, expect, it } from "vitest";
import { modelOutputLocale } from "../codex/codexArtifacts";
import {
  planResearchTranslationBatches,
  RESEARCH_TRANSLATION_BATCH_ITEM_LIMIT,
  RESEARCH_TRANSLATION_BATCH_TEXT_BYTE_LIMIT,
  translationPrompt,
} from "./researchTranslationRunner";

describe("research translation prompt", () => {
  it("pins English as the output language even when the source is Korean", () => {
    const prompt = translationPrompt(
      [{ id: "0", text: "엔비디아의 매출 성장률을 확인합니다." }],
      "en",
    );

    expect(modelOutputLocale(prompt)).toBe("en");
  });

  it("pins Korean as the output language even when the source is English", () => {
    const prompt = translationPrompt(
      [{ id: "0", text: "Review NVIDIA revenue growth." }],
      "ko",
    );

    expect(modelOutputLocale(prompt)).toBe("ko");
  });

  it("plans the exact deterministic execution batches after text deduplication", () => {
    const text = "x".repeat(512);
    const items = [
      ...Array.from(
        { length: RESEARCH_TRANSLATION_BATCH_ITEM_LIMIT + 1 },
        (_, index) => ({ id: `id-${index}`, text: `${text}-${index}` }),
      ),
      { id: "duplicate", text: `${text}-0` },
    ];

    const first = planResearchTranslationBatches(items);
    const second = planResearchTranslationBatches(items);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.flatMap((batch) => batch.items)).toHaveLength(
      RESEARCH_TRANSLATION_BATCH_ITEM_LIMIT + 1,
    );
    expect(first.map((batch) => batch.ordinal)).toEqual(
      first.map((_, index) => index + 1),
    );
    expect(first.every((batch) => batch.inputHash.length === 64)).toBe(true);
    expect(
      Buffer.byteLength(items.map((item) => item.text).join(""), "utf8"),
    ).toBeGreaterThan(RESEARCH_TRANSLATION_BATCH_TEXT_BYTE_LIMIT);
  });
});
