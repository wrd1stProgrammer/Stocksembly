import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/App", () => ({
  App: ({ initialLocale }: { readonly initialLocale: string }) =>
    createElement("div", {
      "data-testid": "home-app",
      "data-locale": initialLocale,
    }),
}));
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "font-variable" }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));

import { cookies, headers } from "next/headers";
import { homeMetadata } from "@/src/lib/seo/homeMetadata";
import { homeMetadataCopy } from "@/src/lib/seo/homeMetadataCopy";
import { metadata as rootMetadata } from "./layout";
import HomePage, { generateMetadata } from "./page";

vi.mock("@/src/editorial/server/editorialWorkspaceAccess", () => ({
  editorialWorkspaceAccess: vi.fn(async () => ({
    authenticated: false,
    tier: "free",
  })),
}));
vi.mock("./_lib/landingResearchRoomPreview", () => ({
  loadLandingResearchRoomPreview: vi.fn(async () => ({
    reports: [],
    companyNames: {},
  })),
}));

describe("homepage metadata", () => {
  it("consolidates the default apex under the English canonical", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(metadata).toEqual(homeMetadata("en"));
  });

  it("uses the explicit URL language before request preferences", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "accept-language": "de-DE" }),
    );
    expect(
      await generateMetadata({ searchParams: Promise.resolve({ lang: "ko" }) }),
    ).toEqual(homeMetadata("ko"));
    vi.mocked(headers).mockReset();
    vi.mocked(headers).mockImplementation(async () => new Headers());
  });

  it("matches the browser language without an explicit URL language", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "accept-language": "ja-JP" }),
    );
    expect(
      await generateMetadata({ searchParams: Promise.resolve({}) }),
    ).toEqual(homeMetadata("ja"));
  });

  it("uses the saved account language before the browser language", async () => {
    const jar = await cookies();
    vi.spyOn(jar, "get").mockImplementation(() => ({
      name: "stocksembly_locale",
      value: "fr",
    }));
    vi.mocked(cookies).mockResolvedValueOnce(jar);
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "accept-language": "en-US" }),
    );
    expect(
      await generateMetadata({ searchParams: Promise.resolve({}) }),
    ).toEqual(homeMetadata("fr"));
  });

  it("publishes an Open Graph image from the root metadata", () => {
    expect(rootMetadata.openGraph).toMatchObject({
      type: "website",
      images: [
        {
          url: "/brand/stocksembly-app-icon.png",
          width: 1024,
          height: 1024,
          alt: "Stocksembly",
        },
      ],
    });
  });

  it("renders WebSite, SoftwareApplication, and complete known Organization facts", async () => {
    const { container } = render(
      await HomePage({ searchParams: Promise.resolve({}) }),
    );
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );

    expect(script?.textContent).toContain('"@type":"WebSite"');
    expect(script?.textContent).toContain('"@type":"SoftwareApplication"');
    expect(script?.textContent).toContain('"@type":"Organization"');
    expect(script?.textContent).toContain('"email":"kicoa24@gmail.com"');
    expect(script?.textContent).toContain('"@type":"PostalAddress"');
    expect(script?.textContent).not.toContain('"telephone"');
    expect(script?.textContent).toContain(homeMetadataCopy.en.description);
  });

  it("keeps an explicit Japanese locale in the URL", async () => {
    const { getByTestId } = render(
      await HomePage({ searchParams: Promise.resolve({ lang: "ja" }) }),
    );

    expect(getByTestId("home-app")).toHaveAttribute("data-locale", "ja");
  });
});
