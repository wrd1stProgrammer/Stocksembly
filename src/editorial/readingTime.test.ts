import { describe, expect, it } from "vitest";
import { editorialReadingMinutes } from "./readingTime";
import type { EditorialEntryCopy } from "./types";

function article(paragraph: string): EditorialEntryCopy {
  return {
    title: "",
    description: "",
    category: "",
    imageAlt: "",
    sections: [{ heading: "", paragraphs: [paragraph] }],
  };
}

describe("editorial reading time", () => {
  it("estimates from the displayed words instead of a catalog constant", () => {
    expect(editorialReadingMinutes(article("example ".repeat(440)), "en")).toBe(
      2,
    );
  });
  it("counts Japanese text without relying on spaces", () => {
    expect(editorialReadingMinutes(article("株".repeat(1000)), "ja")).toBe(2);
  });
  it("shows at least one minute for short text", () => {
    expect(editorialReadingMinutes(article("Short"), "en")).toBe(1);
  });
});
