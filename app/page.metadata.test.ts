import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/App", () => ({ App: () => null }));
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
    const { container } = render(await HomePage());
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
});
