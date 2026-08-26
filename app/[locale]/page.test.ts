import { describe, expect, it } from "vitest";
import { locales } from "@/src/lib/i18n";
import { generateMetadata } from "./page";

describe("localized homepage metadata", () => {
  it("publishes bounded absolute metadata for every locale", async () => {
    for (const locale of locales) {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const { title } = metadata;
      if (typeof title !== "object" || title === null || !("absolute" in title))
        throw new Error("Expected an absolute metadata title");

      expect(title.absolute.length).toBeLessThanOrEqual(60);
      expect(metadata.description?.length).toBeLessThanOrEqual(160);
      expect(metadata.alternates?.canonical).toBe(`/${locale}`);
    }
  });
});
