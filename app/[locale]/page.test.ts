import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { locales } from "@/src/lib/i18n";
import { homeMetadata } from "@/src/lib/seo/homeMetadata";
import { homeMetadataCopy } from "@/src/lib/seo/homeMetadataCopy";
import LocalizedHomePage, { generateMetadata } from "./page";

vi.mock("@/src/App", () => ({ App: () => null }));
vi.mock("@/src/editorial/server/editorialWorkspaceAccess", () => ({
  editorialWorkspaceAccess: vi.fn(async () => ({
    authenticated: false,
    tier: "free",
  })),
}));
vi.mock("../_lib/landingResearchRoomPreview", () => ({
  loadLandingResearchRoomPreview: vi.fn(async () => ({
    reports: [],
    companyNames: {},
  })),
}));

describe("localized homepage metadata", () => {
  it("publishes the complete approved absolute metadata for every locale", async () => {
    for (const locale of locales) {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const { title } = metadata;
      if (typeof title !== "object" || title === null || !("absolute" in title))
        throw new Error("Expected an absolute metadata title");

      expect(metadata).toEqual(homeMetadata(locale));
      expect(metadata.alternates?.canonical).toBe(`/${locale}`);
    }
  });

  it("does not publish homepage metadata for unsupported locales", async () => {
    expect(
      await generateMetadata({
        params: Promise.resolve({ locale: "invalid" }),
      }),
    ).toEqual({});
  });

  it("renders localized schema alongside the Japanese homepage", async () => {
    const { container } = render(
      await LocalizedHomePage({ params: Promise.resolve({ locale: "ja" }) }),
    );
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script?.textContent).toContain(homeMetadataCopy.ja.description);
    expect(script?.textContent).toContain('"inLanguage":"ja-JP"');
  });
});
