import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ROUTE_LOCALE_HEADER } from "@/src/lib/agent/markdownHeaders";

const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "font-variable" }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: "en" }) })),
  headers: vi.fn(async () => requestState.headers),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/src/components/analytics/AnalyticsConsent", () => ({
  AnalyticsConsent: () => null,
}));
vi.mock("@/src/components/auth/AuthSessionBridge", () => ({
  AuthSessionBridge: () => null,
}));

import RootLayout from "./layout";

describe("root document locale", () => {
  it("prefers the locale encoded in a localized route", async () => {
    requestState.headers = new Headers({
      [ROUTE_LOCALE_HEADER]: "ko",
    });

    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>한국어</main> }),
    );

    expect(html).toContain('<html lang="ko-KR"');
    expect(html).toContain('data-locale="ko"');
  });
});
