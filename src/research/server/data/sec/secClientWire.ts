import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import { SecClientError, SecTransportTimeoutError } from "./secClientErrors";
import type { SecWireAdapter } from "./secClientTypes";

const SEC_HTTPS_AGENT = new Agent({
  keepAlive: true,
  maxSockets: 3,
  maxFreeSockets: 1,
  scheduling: "fifo",
});

function normalizedHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") normalized[name.toLowerCase()] = value;
    else if (Array.isArray(value))
      normalized[name.toLowerCase()] = value.join(", ");
  }
  return Object.freeze(normalized);
}

async function* responseChunks(
  response: IncomingMessage,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of response) {
    if (typeof chunk === "string") yield Buffer.from(chunk);
    else if (chunk instanceof Uint8Array) yield Uint8Array.from(chunk);
    else throw new SecClientError("SEC_SCHEMA_INVALID");
  }
}

function assertSecTarget(url: URL): void {
  const isDataHost =
    url.protocol === "https:" &&
    url.hostname === "data.sec.gov" &&
    (url.pathname.startsWith("/submissions/") ||
      url.pathname.startsWith("/api/xbrl/companyfacts/"));
  const isArchiveHost =
    url.protocol === "https:" &&
    url.hostname === "www.sec.gov" &&
    url.pathname.startsWith("/Archives/edgar/data/");
  const isTickerReference =
    url.protocol === "https:" &&
    url.hostname === "www.sec.gov" &&
    url.pathname === "/files/company_tickers_exchange.json";
  if (!isDataHost && !isArchiveHost && !isTickerReference)
    throw new SecClientError("SEC_REQUEST_INVALID");
}

export const nodeSecWireAdapter: SecWireAdapter = async (request) => {
  assertSecTarget(request.url);
  return new Promise((resolve, reject) => {
    const outbound = httpsRequest(
      request.url,
      {
        method: "GET",
        headers: request.headers,
        agent: SEC_HTTPS_AGENT,
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: normalizedHeaders(response.headers),
          body: responseChunks(response),
          abort: () => response.destroy(),
        });
      },
    );
    outbound.setTimeout(request.timeoutMilliseconds, () => {
      outbound.destroy(new SecTransportTimeoutError());
    });
    outbound.once("error", reject);
    outbound.end();
  });
};
