import type { AppLocale } from "../../lib/i18n";

export function researchRoomPageHref(page: number, locale: AppLocale): string {
  const params = new URLSearchParams();
  params.set("lang", locale);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query.length === 0 ? "/research-room" : `/research-room?${query}`;
}
