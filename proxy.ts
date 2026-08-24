import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MARKDOWN_SOURCE_HEADER,
  MARKDOWN_SOURCE_ORIGIN_HEADER,
  ORIGINAL_TARGET_HEADER,
  ROUTE_LOCALE_HEADER,
} from "@/src/lib/agent/markdownHeaders";
import {
  appendVaryAccept,
  preferredRepresentation,
} from "@/src/lib/http/contentNegotiation";
import { isLocale } from "@/src/lib/supportedLocales";

const MARKDOWN_ROUTE_PREFIX = "/api/agent-markdown";
const AGENT_GUIDE_LINK = '</llms.txt>; rel="describedby"';

function routedRequestHeaders(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  const pathLocale = request.nextUrl.pathname.split("/")[1];
  if (isLocale(pathLocale)) requestHeaders.set(ROUTE_LOCALE_HEADER, pathLocale);
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

export function proxy(request: NextRequest): NextResponse | Response {
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

  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const destination = request.nextUrl.clone();
  destination.pathname = `${MARKDOWN_ROUTE_PREFIX}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
  const requestHeaders = routedRequestHeaders(request);
  requestHeaders.set(ORIGINAL_TARGET_HEADER, target);
  requestHeaders.set(MARKDOWN_SOURCE_ORIGIN_HEADER, request.nextUrl.origin);
  const response = NextResponse.rewrite(destination, {
    request: { headers: requestHeaders },
  });
  appendVaryAccept(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|_vercel/|.*\\.[^/]+$).*)"],
};
