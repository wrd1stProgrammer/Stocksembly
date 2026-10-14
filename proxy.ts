import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MARKDOWN_SOURCE_HEADER,
  MARKDOWN_SOURCE_ORIGIN_HEADER,
  ORIGINAL_TARGET_HEADER,
  ROUTE_LOCALE_HEADER,
} from "@/src/lib/agent/markdownHeaders";
import { agentMarkdownResponse } from "@/src/lib/agent/markdownResponse";
import {
  appendVaryAccept,
  preferredRepresentation,
} from "@/src/lib/http/contentNegotiation";
import { isLocale } from "@/src/lib/supportedLocales";

const AGENT_GUIDE_LINK = '</llms.txt>; rel="describedby"';

function routedRequestHeaders(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  const pathLocale = request.nextUrl.pathname.split("/")[1];
  const queryLocale =
    request.nextUrl.pathname === "/"
      ? request.nextUrl.searchParams.get("lang")
      : null;
  const locale = isLocale(pathLocale) ? pathLocale : queryLocale;
  if (isLocale(locale)) requestHeaders.set(ROUTE_LOCALE_HEADER, locale);
  else requestHeaders.delete(ROUTE_LOCALE_HEADER);
  return requestHeaders;
}

function htmlResponse(request: NextRequest): NextResponse {
  const response = NextResponse.next({
    request: { headers: routedRequestHeaders(request) },
  });
  appendVaryAccept(response.headers);
  response.headers.append("Link", AGENT_GUIDE_LINK);
  return response;
}

export const proxy = async (request: NextRequest): Promise<Response> => {
  if (request.headers.get(MARKDOWN_SOURCE_HEADER) === "1")
    return htmlResponse(request);

  const representation = preferredRepresentation(request.headers.get("accept"));
  if (representation === null) {
    return new Response(
      "Not Acceptable\n\nAvailable: text/html, text/markdown\n",
      {
        status: 406,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
        },
      },
    );
  }
  if (representation === "text/html") return htmlResponse(request);

  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", Vary: "Accept" },
    });

  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const requestHeaders = routedRequestHeaders(request);
  const localOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(
    request.nextUrl.hostname,
  );
  // Next normalizes loopback hosts and may derive HTTPS from a reverse proxy.
  // Fetch the allowlisted public source instead of rewriting to that listener.
  const publicOrigin =
    localOrigin && request.headers.get("x-forwarded-proto") === "https"
      ? "https://stocksembly.com"
      : request.nextUrl.origin;
  requestHeaders.set(ORIGINAL_TARGET_HEADER, target);
  requestHeaders.set(MARKDOWN_SOURCE_ORIGIN_HEADER, publicOrigin);
  const response = await agentMarkdownResponse(
    new Request(request.url, {
      headers: requestHeaders,
    }),
  );
  appendVaryAccept(response.headers);
  return request.method === "HEAD" ? new Response(null, response) : response;
};

export const config = {
  matcher: ["/((?!api/|_next/|_vercel/|\\.well-known/|.*\\.[^/]+$).*)"],
};
