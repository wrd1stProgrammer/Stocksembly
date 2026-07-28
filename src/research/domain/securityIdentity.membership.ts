import type { SupportedSecurityIdentity } from "./securityIdentity";

const trustedIdentityMembership = new WeakSet<object>();

export const isSupportedSecurityIdentity = (
  value: unknown,
): value is SupportedSecurityIdentity =>
  typeof value === "object" &&
  value !== null &&
  trustedIdentityMembership.has(value);

export const registerSupportedSecurityIdentity = (
  identity: SupportedSecurityIdentity,
): void => {
  trustedIdentityMembership.add(identity);
};
