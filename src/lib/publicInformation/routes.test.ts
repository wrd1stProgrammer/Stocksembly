import { describe, expect, it } from "vitest";
import { PUBLIC_INFORMATION_KEYS } from "./contracts";
import { publicInformationDocuments } from "./documents";
import {
  publicInformationHref,
  publicInformationLocale,
  publicInformationMetadata,
} from "./routes";

describe("public information internationalization", () => {
  it("uses Korean as the canonical default and English only when requested", () => {
    expect(publicInformationLocale(undefined)).toBe("ko");
    expect(publicInformationLocale("ko")).toBe("ko");
    expect(publicInformationLocale("unexpected")).toBe("ko");
    expect(publicInformationLocale("en")).toBe("en");
  });

  it.each(PUBLIC_INFORMATION_KEYS)(
    "publishes localized metadata and alternates for %s",
    (key) => {
      const document = publicInformationDocuments[key];
      const korean = publicInformationMetadata(document, "ko");
      const english = publicInformationMetadata(document, "en");

      expect(publicInformationHref(document, "ko")).toBe(document.path);
      expect(publicInformationHref(document, "en")).toBe(
        `${document.path}?lang=en`,
      );
      expect(korean).toMatchObject({
        title: document.title.ko,
        description: document.description.ko,
        alternates: {
          canonical: document.path,
          languages: {
            ko: document.path,
            en: `${document.path}?lang=en`,
            "x-default": document.path,
          },
        },
        openGraph: { locale: "ko_KR", alternateLocale: "en_US" },
      });
      expect(english).toMatchObject({
        title: document.title.en,
        description: document.description.en,
        alternates: { canonical: `${document.path}?lang=en` },
        openGraph: { locale: "en_US", alternateLocale: "ko_KR" },
      });
    },
  );
});
