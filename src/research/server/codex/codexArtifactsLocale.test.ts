import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  effectiveCodexPrompt,
  hydrateLocalizedCandidate,
  modelOutputLocale,
  schemaDocument,
} from "./codexArtifacts";

const LocalizedOutputSchema = z.object({
  headline: z.object({ en: z.string(), ko: z.string() }),
  nested: z.array(
    z.object({ detail: z.object({ en: z.string(), ko: z.string() }) }),
  ),
});

describe("single-language Codex output boundary", () => {
  it("projects every localized object to the selected language", () => {
    const document = schemaDocument(LocalizedOutputSchema, "ko") as {
      readonly properties: Record<string, unknown>;
    };
    expect(document).toMatchObject({
      properties: {
        headline: {
          properties: { ko: expect.any(Object) },
          required: ["ko"],
        },
        nested: {
          items: {
            properties: {
              detail: {
                properties: { ko: expect.any(Object) },
                required: ["ko"],
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(document)).not.toContain('"required":["en","ko"]');
  });

  it("infers the run locale and adds an overriding language contract", () => {
    const prompt = `Analyze this request.\n${JSON.stringify({ locale: "en" })}`;
    expect(modelOutputLocale(prompt)).toBe("en");
    expect(effectiveCodexPrompt(prompt)).toContain(
      "return only the en key and omit the other language key",
    );
  });

  it("hydrates omitted language keys only after model output", () => {
    expect(
      hydrateLocalizedCandidate(
        { headline: { ko: "핵심 결론" }, nested: [{ detail: { ko: "근거" } }] },
        "ko",
      ),
    ).toEqual({
      headline: { ko: "핵심 결론", en: "핵심 결론" },
      nested: [{ detail: { ko: "근거", en: "근거" } }],
    });
  });

  it("carries the source language into later mirrored workflow stages", () => {
    const prompt = JSON.stringify({
      memo: {
        thesis: { en: "성장률을 확인합니다.", ko: "성장률을 확인합니다." },
      },
    });
    expect(modelOutputLocale(prompt)).toBe("ko");
  });
});
