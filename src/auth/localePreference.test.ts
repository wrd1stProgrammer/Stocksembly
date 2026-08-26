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
  vi.mocked(syncResearchSession).mockResolvedValue(undefined);
  vi.mocked(currentAuthTokens).mockResolvedValue({
    accessToken: "access-token",
    identityToken: "identity-token",
  });
});

describe("account locale preference", () => {
  it("applies an explicit selection to the browser locale sources", () => {
    applyLocalePreference("ko", { updateUrl: true });

    expect(window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)).toBe(
      "ko",
    );
    expect(document.documentElement.lang).toBe("ko");
    expect(document.cookie).toContain("stocksembly_locale=ko");
    expect(new URL(window.location.href).searchParams.get("lang")).toBe("ko");
  });

  it("persists the selection with the signed-in account tokens", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ locale: "ko", stored: true }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(persistAccountLocale("ko")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ locale: "ko" }),
        headers: expect.any(Headers),
      }),
    );
    const request = fetch.mock.calls[0]?.[1];
    expect(request?.headers.get("authorization")).toBe("Bearer access-token");
    expect(request?.headers.get("x-stocksembly-identity-token")).toBe(
      "identity-token",
    );
  });
});
