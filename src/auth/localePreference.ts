import type { AppLocale } from "../lib/i18n";
import { currentAuthTokens, syncResearchSession } from "./researchSession";

export const PREFERRED_LOCALE_STORAGE_KEY = "stocksembly:preferred-locale";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function applyLocalePreference(
  locale: AppLocale,
  options: { readonly updateUrl?: boolean } = {},
): void {
  window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  document.cookie = `stocksembly_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  if (options.updateUrl !== true) return;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  window.history.replaceState(window.history.state, "", url);
}

async function localePreferenceHeaders(): Promise<Headers> {
  const headers = new Headers({ "content-type": "application/json" });
  const tokens = await currentAuthTokens().catch(() => undefined);
  if (tokens?.accessToken !== undefined)
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
  if (tokens?.identityToken !== undefined)
    headers.set("x-stocksembly-identity-token", tokens.identityToken);
  return headers;
}

export async function persistAccountLocale(
  locale: AppLocale,
): Promise<boolean> {
  await syncResearchSession().catch(() => undefined);
  const response = await fetch("/api/account/preferences", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: await localePreferenceHeaders(),
    body: JSON.stringify({ locale }),
  }).catch(() => undefined);
  if (response?.ok !== true) return false;
  const payload = (await response.json().catch(() => undefined)) as
    | { readonly locale?: unknown; readonly stored?: unknown }
    | undefined;
  return payload?.locale === locale && payload.stored === true;
}
