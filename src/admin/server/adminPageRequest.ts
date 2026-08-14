import { cookies, headers } from "next/headers";

export type PageSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export function pageUrlSearchParams(values: PageSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  return params;
}

export async function adminPageRequest(
  pathname: string,
  searchParams: URLSearchParams,
): Promise<Request> {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "http";
  const url = new URL(pathname, `${protocol}://${host}`);
  url.search = searchParams.toString();
  return new Request(url, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
}
