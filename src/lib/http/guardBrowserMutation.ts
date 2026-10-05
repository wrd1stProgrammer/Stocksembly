/** Browser-only mutations must carry an explicit same-origin context. */
export async function guardBrowserMutation(
  request: Request,
): Promise<Response | undefined> {
  const configured = process.env["STOCKSEMBLY_PUBLIC_ORIGIN"];
  const expected = configured
    ? new URL(configured).origin
    : new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin !== expected || (site !== null && site !== "same-origin"))
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (request.body === null) return undefined;
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  const reader = request.clone().body?.getReader();
  if (!reader) return undefined;
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536) {
        void reader.cancel();
        return Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
      }
    }
  } finally {
    reader.releaseLock();
  }
  return undefined;
}
