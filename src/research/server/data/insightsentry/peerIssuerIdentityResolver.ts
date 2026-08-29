import {
  resolveSecIssuer,
  type SecIssuerResolution,
} from "../sec/issuerResolver";
import { createSecClient } from "../sec/secClient";
import type { SecClient } from "../sec/secClientTypes";

export type PeerIssuerIdentityResolution =
  | {
      readonly status: "eligible";
      readonly canonicalTicker: string;
      readonly identity: Extract<
        SecIssuerResolution,
        { readonly kind: "admitted" }
      >["identity"];
      readonly evidence: {
        readonly identityHash: string;
      };
    }
  | {
      readonly status: "not_eligible";
      readonly canonicalTicker: string;
      readonly reason: string;
    };

export type PeerIssuerIdentityResolver = (
  ticker: string,
) => Promise<PeerIssuerIdentityResolution>;

export function canonicalPeerTicker(value: string): string | undefined {
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  const separator = normalized.lastIndexOf(":");
  const ticker = (separator < 0 ? normalized : normalized.slice(separator + 1))
    .trim()
    .replaceAll("/", "-");
  return /^[A-Z][A-Z0-9.-]{0,9}$/u.test(ticker) ? ticker : undefined;
}

export function createPeerIssuerIdentityResolver(input: {
  readonly dataRoot: string;
  readonly cutoffAt: string;
  readonly createClient?: (options: { readonly dataRoot: string }) => SecClient;
  readonly resolveIssuer?: typeof resolveSecIssuer;
}): PeerIssuerIdentityResolver {
  const client = (input.createClient ?? createSecClient)({
    dataRoot: input.dataRoot,
  });
  const resolveIssuer = input.resolveIssuer ?? resolveSecIssuer;
  const cache = new Map<string, Promise<PeerIssuerIdentityResolution>>();
  return async (candidateTicker) => {
    const canonicalTicker = canonicalPeerTicker(candidateTicker);
    if (canonicalTicker === undefined)
      return Object.freeze({
        status: "not_eligible",
        canonicalTicker: candidateTicker.normalize("NFKC").trim().toUpperCase(),
        reason: "invalid_ticker",
      });
    const cached = cache.get(canonicalTicker);
    if (cached !== undefined) return cached;
    const pending = resolveIssuer(client, {
      ticker: canonicalTicker,
      cutoffAt: input.cutoffAt,
    })
      .then((resolution): PeerIssuerIdentityResolution => {
        if (resolution.kind !== "admitted")
          return Object.freeze({
            status: "not_eligible",
            canonicalTicker,
            reason:
              resolution.kind === "rejected"
                ? resolution.reason
                : "invalid_ticker",
          });
        return Object.freeze({
          status: "eligible",
          canonicalTicker,
          identity: resolution.identity,
          evidence: Object.freeze({
            identityHash: resolution.evidence.identityHash,
          }),
        });
      })
      .catch(
        (): PeerIssuerIdentityResolution =>
          Object.freeze({
            status: "not_eligible",
            canonicalTicker,
            reason: "resolution_failed",
          }),
      );
    cache.set(canonicalTicker, pending);
    return pending;
  };
}
