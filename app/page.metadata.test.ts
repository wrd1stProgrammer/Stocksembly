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

import { metadata as rootMetadata } from "./layout";
import HomePage, { metadata } from "./page";

describe("homepage metadata", () => {
  it("consolidates the language-negotiated apex under the English canonical", () => {
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(metadata.alternates?.languages).toBeUndefined();
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
  });

  it("keeps an explicit Japanese locale in the URL", async () => {
    const { getByTestId } = render(
      await HomePage({ searchParams: Promise.resolve({ lang: "ja" }) }),
    );

    expect(getByTestId("home-app")).toHaveAttribute("data-locale", "ja");
  });
});
