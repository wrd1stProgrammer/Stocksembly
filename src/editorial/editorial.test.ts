import { describe, expect, it } from "vitest";
import { editorialDefinitions, editorialEntries } from "./catalog";
import { editorialContent } from "./content";
import { editorialEntryMetadata, editorialIndexMetadata } from "./metadata";

describe("editorial library", () => {
  it("ships substantial blog posts and glossary terms in every locale", () => {
    expect(editorialEntries("blog")).toHaveLength(5);
    expect(editorialEntries("glossary")).toHaveLength(5);
    for (const content of Object.values(editorialContent)) {
      expect(Object.keys(content.entries)).toHaveLength(10);
      for (const definition of editorialDefinitions) {
        const entry = content.entries[definition.slug];
        expect(entry.title.length).toBeGreaterThan(3);
        expect(
          entry.sections.flatMap((section) => section.paragraphs).length,
        ).toBeGreaterThanOrEqual(5);
        expect(
          entry.sections.flatMap((section) => section.bullets ?? []).length,
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("publishes localized canonical, hreflang, and social metadata", () => {
    const definition = editorialDefinitions[0];
    expect(definition).toBeDefined();
    if (definition === undefined) return;

    expect(editorialIndexMetadata("ko", "blog")).toMatchObject({
      alternates: { canonical: "/ko/blog" },
      openGraph: { locale: "ko_KR" },
    });
    expect(editorialEntryMetadata("en", definition)).toMatchObject({
      alternates: {
        canonical: `/en/blog/${definition.slug}`,
        languages: {
          "en-US": `/en/blog/${definition.slug}`,
          "ko-KR": `/ko/blog/${definition.slug}`,
          "x-default": `/en/blog/${definition.slug}`,
        },
      },
      openGraph: {
        type: "article",
        images: [{ url: `https://stocksembly.com${definition.image}` }],
      },
    });
  });
});
