import type { SecIdentityInput } from "./secIdentityConfig";

export function deriveSecUserAgent(identity: SecIdentityInput): string {
  return `Stocksembly/1.0 (${identity.organization}; ${identity.contactEmail})`;
}
