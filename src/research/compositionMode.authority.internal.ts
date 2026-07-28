import type { CompositionOrigin, ResearchMode } from "./compositionMode";

export type CompositionValueKind =
  | "event"
  | "artifact"
  | "snapshot"
  | "payload";

type CompositionAttestation = {
  readonly kind: CompositionValueKind;
  readonly mode: ResearchMode;
  readonly origin: object;
};

const trustedOrigins = new WeakMap<object, ResearchMode>();
const trustedValues = new WeakMap<object, CompositionAttestation>();

export function registerTrustedCompositionOrigin(
  origin: object,
  mode: ResearchMode,
): boolean {
  const existingMode = trustedOrigins.get(origin);
  if (existingMode !== undefined) return existingMode === mode;
  trustedOrigins.set(origin, mode);
  return true;
}

export function isTrustedCompositionOrigin<M extends ResearchMode>(
  value: unknown,
  expected: M,
): value is CompositionOrigin<M> {
  return isObject(value) && trustedOrigins.get(value) === expected;
}

export function registerTrustedCompositionValue(
  value: object,
  kind: CompositionValueKind,
  mode: ResearchMode,
  origin: CompositionOrigin,
): boolean {
  if (trustedOrigins.get(origin) !== mode) return false;
  const existing = trustedValues.get(value);
  if (existing !== undefined) {
    return (
      existing.kind === kind &&
      existing.mode === mode &&
      existing.origin === origin
    );
  }
  trustedValues.set(value, { kind, mode, origin });
  return true;
}

export function isTrustedCompositionValue(
  value: unknown,
  kind: CompositionValueKind,
  expected: ResearchMode,
  origin: unknown,
): boolean {
  if (!isObject(value) || !isObject(origin)) return false;
  const attestation = trustedValues.get(value);
  return (
    attestation?.kind === kind &&
    attestation.mode === expected &&
    attestation.origin === origin &&
    trustedOrigins.get(origin) === expected
  );
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
