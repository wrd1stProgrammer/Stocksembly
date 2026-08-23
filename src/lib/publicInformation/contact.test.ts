import { describe, expect, it } from "vitest";
import { contactDocument } from "./contact";

describe("contact trust page content", () => {
  it.each(["en", "ko"] as const)(
    "publishes substantial and actionable %s contact guidance",
    (locale) => {
      const body = contactDocument.sections
        .flatMap((section) => [
          section.title[locale],
          ...section.paragraphs.map((paragraph) => paragraph[locale]),
          ...("bullets" in section
            ? section.bullets.map((bullet) => bullet[locale])
            : []),
        ])
        .join(" ");

      expect(body.length).toBeGreaterThan(500);
      expect(body).toContain("kicoa24@gmail.com");
    },
  );
});
