import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConsent } from "./AnalyticsConsent";

const CONSENT_COOKIE = "stocksembly_analytics_consent";
const PENDING_KEY = "stocksembly:pending-acquisition-v1";

function grantConsent(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup for consent behavior.
  document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
}

function denyConsent(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup for consent behavior.
  document.cookie = `${CONSENT_COOKIE}=denied; Path=/`;
}

afterEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie cleanup for consent behavior.
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("AnalyticsConsent attribution", () => {
  it("submits the Threads UTM and keeps it while authentication is pending", async () => {
    grantConsent();
    window.history.replaceState(
      {},
      "",
      "/?utm_source=threads&utm_medium=organic_social&utm_campaign=threads_profile&utm_content=bio_link",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({
        ok: false,
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsConsent enabled />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      source: "threads",
      medium: "organic_social",
      campaign: "threads_profile",
      content: "bio_link",
      landingPath: "/",
    });
    expect(window.localStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it("submits the Threads UTM even when analytics consent is denied", async () => {
    denyConsent();
    window.history.replaceState({}, "", "/?utm_source=threads&utm_content=bio");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({
        ok: false,
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsConsent enabled />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      source: "threads",
      content: "bio",
      landingPath: "/",
    });
    expect(window.localStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it("replaces a pending direct landing with the first explicit campaign", async () => {
    grantConsent();
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        landingPath: "/",
        capturedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
    window.history.replaceState(
      {},
      "",
      "/pricing?utm_source=threads&utm_medium=organic_social&utm_campaign=launch",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({
        ok: false,
        status: 503,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsConsent enabled />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "{}"),
    ).toMatchObject({
      source: "threads",
      campaign: "launch",
      landingPath: "/pricing",
    });
  });
});
