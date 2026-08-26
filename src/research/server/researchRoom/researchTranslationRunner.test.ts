import { describe, expect, it } from "vitest";
import { modelOutputLocale } from "../codex/codexArtifacts";
import { translationPrompt } from "./researchTranslationRunner";

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
});
