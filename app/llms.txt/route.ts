import { LLMS_TEXT } from "@/src/lib/agent/llmsText";

export function GET(): Response {
  return new Response(LLMS_TEXT, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
