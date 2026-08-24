import { describe, expect, it } from "vitest";
import {
  boundedSeoDescription,
  brandedSeoTitle,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
} from "./metadataText";

describe("SEO metadata text", () => {
  it("keeps the brand in a bounded title", () => {
    const title = brandedSeoTitle(
      "An unusually long stock analysis title with valuation, catalysts, risks, and competitive positioning",
    );

    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX_LENGTH);
    expect(title).toMatch(/… · Stocksembly$/);
  });

  it("normalizes and bounds long descriptions", () => {
    const description = boundedSeoDescription(
      `A long description ${"with repeated evidence ".repeat(20)}`,
    );

    expect(description.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX_LENGTH);
    expect(description).not.toContain("  ");
    expect(description.endsWith("…")).toBe(true);
  });
});
