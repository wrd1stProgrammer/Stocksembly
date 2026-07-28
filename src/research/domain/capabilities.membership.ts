import type { CapabilityDisclosure } from "./capabilities";

const trustedCapabilityMembership = new WeakSet<object>();

export const registerTrustedCapabilityDisclosure = (
  disclosure: CapabilityDisclosure,
): void => {
  trustedCapabilityMembership.add(disclosure);
};

export const isTrustedCapabilityDisclosure = (
  value: unknown,
): value is CapabilityDisclosure =>
  typeof value === "object" &&
  value !== null &&
  trustedCapabilityMembership.has(value);
