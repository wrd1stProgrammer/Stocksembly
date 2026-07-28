import type { SecRequest } from "./secClientRequest";

export type SecClock = {
  readonly now: () => number;
  readonly isoNow: () => string;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

export type SecWireRequest = {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMilliseconds: number;
};

export type SecWireResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
  readonly abort: () => void;
};

export type SecWireAdapter = (
  request: SecWireRequest,
) => Promise<SecWireResponse>;

export type SecResponseProvenance = {
  readonly sourceUrl: string;
  readonly requestedAt: string;
  readonly retrievedAt: string;
  readonly responseStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly identityHash: string;
  readonly cacheStatus: "miss" | "revalidated";
};

export type SecFetchResult = {
  readonly request: SecRequest;
  readonly bytes: Uint8Array;
  readonly provenance: SecResponseProvenance;
};

export type SecClientOptions = {
  readonly dataRoot: string;
  readonly adapter?: SecWireAdapter;
  readonly clock?: SecClock;
  readonly maxConcurrency?: number;
};

export interface SecClient {
  readonly fetch: (request: unknown) => Promise<SecFetchResult>;
}
