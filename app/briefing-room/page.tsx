import "@/src/styles/research-room.css";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  loadLocalBriefingOverlay,
  mergeLocalBriefingOverlay,
} from "@/src/briefing/server/localBriefingPreviewStore";
import { BriefingRoom } from "@/src/components/briefing/BriefingRoom";
import {
  type AppLocale,
  appLocaleFromValue,
  isLocale,
  researchLocale,
} from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관심종목 프리마켓 브리핑",
  description:
    "관심종목의 최근 24시간 변화와 예정 이벤트를 미국 장 시작 한 시간 전에 확인하세요.",
  alternates: { canonical: "/briefing-room" },
  robots: { index: false, follow: false },
};

type Props = { readonly searchParams: Promise<{ readonly lang?: string }> };

async function requestFromPage(locale: AppLocale) {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  return new Request(`http://${host}/briefing-room?lang=${locale}`, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
}

export default async function BriefingRoomPage({ searchParams }: Props) {
  const query = await searchParams;
  const storedLocale = (await cookies()).get("stocksembly_locale")?.value;
  const requestedLocale = isLocale(query.lang) ? query.lang : undefined;
  const requestLocale =
    requestedLocale ??
    (isLocale(storedLocale) ? storedLocale : appLocaleFromValue(undefined));
  const request = await requestFromPage(requestLocale);
  const api = await getLiveResearchApi();
  const preference = await api.preferredLocale(request);
  const locale: AppLocale =
    requestedLocale ??
    preference.locale ??
    (isLocale(storedLocale) ? storedLocale : appLocaleFromValue(undefined));
  if (preference.authenticated && query.lang !== locale)
    redirect(`/briefing-room?lang=${locale}`);
  const contentLocale = researchLocale(locale);
  const [state, overlay] = await Promise.all([
    api.briefingRoom(request, contentLocale),
    loadLocalBriefingOverlay(contentLocale),
  ]);
  return (
    <BriefingRoom
      initialState={mergeLocalBriefingOverlay(state, overlay)}
      initialDetails={overlay.details}
      locale={locale}
      contentLocale={contentLocale}
    />
  );
}
