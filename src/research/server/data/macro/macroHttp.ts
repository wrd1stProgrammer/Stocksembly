export type MacroClock = {
  readonly isoNow: () => string;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

export type MacroHttpRequest = {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMilliseconds: number;
};

export type MacroHttpResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type MacroHttpTransport = (
  request: MacroHttpRequest,
) => Promise<MacroHttpResponse>;

export type UnavailableReleaseTime = {
  readonly availability: "unavailable";
};

export type MacroProvenance = {
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly contentHash: string;
  readonly freshness: "fresh" | "stale";
};

export const UNAVAILABLE_RELEASE_TIME: UnavailableReleaseTime = Object.freeze({
  availability: "unavailable",
});

export const MACRO_REQUEST_TIMEOUT_MILLISECONDS = 60_000;
export const MACRO_MAX_ATTEMPTS = 3;

export function retryDelay(attempt: number): number {
  return Math.min(2_000, 250 * 2 ** (attempt - 1));
}
