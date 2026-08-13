import type { Locale } from "../../lib/i18n";

export function researchRoomPageHref(page: number, locale: Locale): string {
  const params = new URLSearchParams();
  if (locale === "en") params.set("lang", "en");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query.length === 0 ? "/research-room" : `/research-room?${query}`;
}
