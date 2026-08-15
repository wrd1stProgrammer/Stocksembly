import "server-only";

import { cookies, headers } from "next/headers";
import { getLiveResearchApi } from "../../research/server/api/liveResearchApi";
import type { ResearchRoomAccess } from "../../research/server/researchRoom/researchRoomCatalog";

export async function editorialWorkspaceAccess(
  pathname: string,
): Promise<ResearchRoomAccess> {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  const request = new Request(`http://${host}${pathname}`, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
  return await (await getLiveResearchApi()).researchRoomAccess(request);
}
