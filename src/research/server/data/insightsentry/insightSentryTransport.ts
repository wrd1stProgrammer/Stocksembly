import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Agent, request as httpsRequest } from "node:https";

export type InsightSentryWireRequest = {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly method?: "GET" | "POST";
  readonly body?: Uint8Array;
  readonly timeoutMilliseconds: number;
};

export type InsightSentryWireResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
  readonly abort: () => void;
};

export type InsightSentryWireAdapter = (
  request: InsightSentryWireRequest,
) => Promise<InsightSentryWireResponse>;

export type InsightSentryTransportFailure = "network" | "timeout";

export class InsightSentryTransportError extends Error {
  readonly name = "InsightSentryTransportError";

  constructor(readonly kind: InsightSentryTransportFailure) {
    super(kind);
  }
}

const AGENT = new Agent({
  keepAlive: true,
  maxSockets: 2,
  maxFreeSockets: 1,
  scheduling: "fifo",
});

function normalizedHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") result[name.toLowerCase()] = value;
    else if (Array.isArray(value))
      result[name.toLowerCase()] = value.join(", ");
  }
  return Object.freeze(result);
}

async function* chunks(response: IncomingMessage): AsyncGenerator<Uint8Array> {
  try {
    for await (const chunk of response) {
      if (typeof chunk === "string") yield Buffer.from(chunk);
      else if (Buffer.isBuffer(chunk)) yield Uint8Array.from(chunk);
      else if (chunk instanceof Uint8Array) yield Uint8Array.from(chunk);
      else throw new InsightSentryTransportError("network");
    }
  } catch (error) {
    if (error instanceof InsightSentryTransportError) throw error;
    if (error instanceof Error)
      throw new InsightSentryTransportError("network");
    throw error;
  }
}

export const nodeInsightSentryWireAdapter: InsightSentryWireAdapter = async (
  request,
) => {
  if (
    request.url.protocol !== "https:" ||
    request.url.hostname !== "insightsentry.p.rapidapi.com"
  )
    throw new InsightSentryTransportError("network");

  return await new Promise((resolve, reject) => {
    const body = request.body;
    const headers =
      body === undefined
        ? request.headers
        : {
            ...request.headers,
            "content-type": "application/json",
            "content-length": String(body.byteLength),
          };
    const outbound = httpsRequest(
      request.url,
      { method: request.method ?? "GET", headers, agent: AGENT },
      (response) =>
        resolve({
          status: response.statusCode ?? 0,
          headers: normalizedHeaders(response.headers),
          body: chunks(response),
          abort: () => response.destroy(),
        }),
    );
    outbound.setTimeout(request.timeoutMilliseconds, () => {
      outbound.destroy(new InsightSentryTransportError("timeout"));
    });
    outbound.once("error", (error) => {
      reject(
        error instanceof InsightSentryTransportError
          ? error
          : new InsightSentryTransportError("network"),
      );
    });
    if (body !== undefined) outbound.write(body);
    outbound.end();
  });
};
