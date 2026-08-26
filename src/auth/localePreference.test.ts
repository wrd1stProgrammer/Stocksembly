import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalePreference,
  PREFERRED_LOCALE_STORAGE_KEY,
  persistAccountLocale,
} from "./localePreference";
import { currentAuthTokens, syncResearchSession } from "./researchSession";

vi.mock("./researchSession", () => ({
  currentAuthTokens: vi.fn(),
  syncResearchSession: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?lang=en");
  vi.mocked(syncResearchSession).mockResolvedValue(true);
  vi.mocked(currentAuthTokens).mockResolvedValue({
    accessToken: "access-token",
    identityToken: "identity-token",
  });
});

describe("account locale preference", () => {
  it("applies an explicit selection to the browser locale sources", () => {
    applyLocalePreference("ja", { updateUrl: true });

    expect(window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)).toBe(
      "ja",
    );
    expect(document.documentElement.lang).toBe("ja");
    expect(document.cookie).toContain("stocksembly_locale=ja");
    expect(new URL(window.location.href).searchParams.get("lang")).toBe("ja");
  });

  it("persists the selection with the signed-in account tokens", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ locale: "ja", stored: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistAccountLocale("ja")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ locale: "ja" }),
        headers: expect.any(Headers),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(request?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("x-stocksembly-identity-token")).toBe("identity-token");
  });
});
