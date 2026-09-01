import { cookies, headers } from "next/headers";

// Builds a same-origin Request from the incoming page request so server pages
// can call the research API handlers with the visitor's own cookies.
export async function requestFromPage(path: string): Promise<Request> {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  return new Request(`http://${host}${path}`, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
}
