import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MARKDOWN_SOURCE_HEADER,
  ORIGINAL_TARGET_HEADER,
} from "@/src/lib/agent/markdownHeaders";
import {
  appendVaryAccept,
  preferredRepresentation,
} from "@/src/lib/http/contentNegotiation";

const MARKDOWN_ROUTE_PREFIX = "/api/agent-markdown";
const AGENT_GUIDE_LINK = '</llms.txt>; rel="describedby"';

function htmlResponse(): NextResponse {
  const response = NextResponse.next();
  appendVaryAccept(response.headers);
  response.headers.append("Link", AGENT_GUIDE_LINK);
  return response;
}

export function proxy(request: NextRequest): NextResponse | Response {
  if (request.headers.get(MARKDOWN_SOURCE_HEADER) === "1")
    return htmlResponse();

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
  if (representation === "text/html") return htmlResponse();

  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const destination = request.nextUrl.clone();
  destination.pathname = `${MARKDOWN_ROUTE_PREFIX}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ORIGINAL_TARGET_HEADER, target);
  const response = NextResponse.rewrite(destination, {
    request: { headers: requestHeaders },
  });
  appendVaryAccept(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|_vercel/|.*\\.[^/]+$).*)"],
};
