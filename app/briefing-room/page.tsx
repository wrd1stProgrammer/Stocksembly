import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import {
  loadLocalBriefingOverlay,
  mergeLocalBriefingOverlay,
} from "@/src/briefing/server/localBriefingPreviewStore";
import { BriefingRoom } from "@/src/components/briefing/BriefingRoom";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관심종목 프리마켓 브리핑",
  description:
    "관심종목의 최근 24시간 변화와 예정 이벤트를 미국 장 시작 한 시간 전에 확인하세요.",
  alternates: { canonical: "/briefing-room" },
};

type Props = { readonly searchParams: Promise<{ readonly lang?: string }> };

async function requestFromPage(locale: Locale) {
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
  const locale: Locale = query.lang === "en" ? "en" : "ko";
  const [state, overlay] = await Promise.all([
    (await getLiveResearchApi()).briefingRoom(
      await requestFromPage(locale),
      locale,
    ),
    loadLocalBriefingOverlay(locale),
  ]);
  return (
    <BriefingRoom
      initialState={mergeLocalBriefingOverlay(state, overlay)}
      initialDetails={overlay.details}
      locale={locale}
    />
  );
}
