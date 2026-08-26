import ky from "ky";
import { z } from "zod";
import {
  agentNotFoundMarkdown,
  htmlToAgentMarkdown,
} from "@/src/lib/agent/htmlToMarkdown";
import {
  MARKDOWN_SOURCE_HEADER,
  MARKDOWN_SOURCE_ORIGIN_HEADER,
  ORIGINAL_TARGET_HEADER,
} from "@/src/lib/agent/markdownHeaders";

const originalTargetSchema = z
  .string()
  .max(4_096)
  .regex(/^\/(?!\/)/);

function sourceTarget(request: Request): string | undefined {
  const parsed = originalTargetSchema.safeParse(
    request.headers.get(ORIGINAL_TARGET_HEADER),
  );
  return parsed.success ? parsed.data : undefined;
}

function sourceOrigin(request: Request): string | undefined {
  const parsed = z
    .url()
    .max(2_048)
    .safeParse(request.headers.get(MARKDOWN_SOURCE_ORIGIN_HEADER));
  if (!parsed.success) return undefined;
  const origin = new URL(parsed.data);
  if (origin.origin === "https://stocksembly.com") return origin.origin;
  const localSameOrigin =
    origin.origin === new URL(request.url).origin &&
    (origin.hostname === "localhost" || origin.hostname === "127.0.0.1") &&
    (origin.protocol === "http:" || origin.protocol === "https:");
  return localSameOrigin ? origin.origin : undefined;
}

function sourceRequestHeaders(request: Request): Headers {
  const sourceHeaders = new Headers({
    Accept: "text/html",
    [MARKDOWN_SOURCE_HEADER]: "1",
  });
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage !== null)
    sourceHeaders.set("Accept-Language", acceptLanguage);
  return sourceHeaders;
}

function markdownResponse(source: Response, html: string, sourceUrl: URL) {
  const markdown =
    source.status === 404 || source.status === 410
      ? agentNotFoundMarkdown(sourceUrl)
      : htmlToAgentMarkdown(html, sourceUrl);
  return new Response(markdown, {
    status: source.status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept, Accept-Language",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const target = sourceTarget(request);
  const origin = sourceOrigin(request);
  if (target === undefined || origin === undefined)
    return new Response("Bad Request\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  const sourceUrl = new URL(target, origin);

  try {
    const source = await ky.get(sourceUrl, {
      headers: sourceRequestHeaders(request),
      retry: 0,
      timeout: 15_000,
      throwHttpErrors: false,
    });
    const sourceType = source.headers.get("Content-Type") ?? "";
    if (!sourceType.toLowerCase().includes("text/html"))
      return new Response(
        "Not Acceptable\n\nThe source does not have an HTML representation.\n",
        {
          status: 406,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            Vary: "Accept",
          },
        },
      );
    const html = await source.text();
    return markdownResponse(source, html, sourceUrl);
  } catch (error) {
    // no-excuse-ok: catch -- this HTTP boundary must return a stable response.
    return new Response(
      `Bad Gateway\n\nThe HTML representation could not be loaded: ${error instanceof Error ? error.message : "unknown error"}\n`,
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
        },
      },
    );
  }
}
