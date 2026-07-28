import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CapabilityDisclosure,
  CapabilityKey,
} from "../../../domain/capabilities";
import { registerTrustedCapabilityDisclosure } from "../../../domain/capabilities.membership";
import { hashBytes, timestampMillis } from "../../../domain/contractHelpers";
import { ArtifactIdSchema } from "../../../domain/ids";
import {
  evaluateModelTransfer,
  type RightsSource,
} from "../../../domain/rights";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  type ArtifactWrite,
} from "../../../ports/artifacts";

const LicensedCapabilityKeySchema = z.enum([
  "current_market_data",
  "consensus",
  "professional_news",
  "options",
  "short_interest",
]);
const SupportedProviderIdentitySchema = z
  .object({
    cik: z.string().regex(/^\d{10}$/),
    ticker: z.string().trim().min(1).max(16),
    exchange: z.enum(["NASDAQ", "NYSE", "NYSE_AMERICAN"]),
    identityHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .passthrough();

export type CommittedLicensedProviderEvidence = {
  readonly raw: ArtifactDescriptor;
  readonly normalized: ArtifactDescriptor;
  readonly retrievedAt: string;
  readonly freshThrough: string;
  readonly schemaVersion: string;
  readonly rightsSource: RightsSource;
};

async function put(
  cas: ArtifactCasPort,
  artifact: Omit<ArtifactWrite, "artifactId">,
): Promise<ArtifactDescriptor> {
  return await cas.put({
    ...artifact,
    artifactId: ArtifactIdSchema.parse(randomUUID()),
  });
}

export async function commitLicensedProviderEvidence<T>(input: {
  readonly cas: ArtifactCasPort;
  readonly runId: ArtifactWrite["runId"];
  readonly snapshotId: ArtifactWrite["snapshotId"];
  readonly rawBytes: Uint8Array;
  readonly normalized: unknown;
  readonly schema: z.ZodType<T>;
  readonly rawMediaType: string;
  readonly normalizedMediaType: string;
  readonly retrievedAt: string;
  readonly freshThrough: string;
  readonly schemaVersion: string;
  readonly rightsSource: "insightsentry_rapidapi";
}): Promise<CommittedLicensedProviderEvidence> {
  timestampMillis(input.retrievedAt);
  timestampMillis(input.freshThrough);
  if (input.rawBytes.byteLength === 0)
    throw new TypeError("provider raw bytes must not be empty");
  const normalizedBytes = new TextEncoder().encode(
    JSON.stringify(input.schema.parse(input.normalized)),
  );
  const raw = await put(input.cas, {
    runId: input.runId,
    snapshotId: input.snapshotId,
    mediaType: input.rawMediaType,
    parentDigests: [],
    bytes: input.rawBytes,
  });
  const normalized = await put(input.cas, {
    runId: input.runId,
    snapshotId: input.snapshotId,
    mediaType: input.normalizedMediaType,
    parentDigests: [raw.digest],
    bytes: normalizedBytes,
  });
  return Object.freeze({
    raw,
    normalized,
    retrievedAt: input.retrievedAt,
    freshThrough: input.freshThrough,
    schemaVersion: input.schemaVersion,
    rightsSource: input.rightsSource,
  });
}

async function descriptorIsCommitted(
  cas: ArtifactCasPort,
  descriptor: ArtifactDescriptor,
): Promise<boolean> {
  const committed = await cas.get(descriptor.digest);
  return (
    committed !== undefined &&
    committed.descriptor.artifactId === descriptor.artifactId &&
    committed.descriptor.runId === descriptor.runId &&
    committed.descriptor.snapshotId === descriptor.snapshotId &&
    committed.descriptor.digest === descriptor.digest &&
    committed.descriptor.byteLength === descriptor.byteLength &&
    committed.descriptor.mediaType === descriptor.mediaType &&
    committed.descriptor.parentDigests.length ===
      descriptor.parentDigests.length &&
    committed.descriptor.parentDigests.every(
      (digest, index) => digest === descriptor.parentDigests[index],
    ) &&
    hashBytes(committed.bytes) === descriptor.digest
  );
}

export async function attestLicensedProviderCapability(input: {
  readonly cas: ArtifactCasPort;
  readonly identity: unknown;
  readonly key: CapabilityKey;
  readonly evidence: CommittedLicensedProviderEvidence;
  readonly now: string;
}): Promise<CapabilityDisclosure | undefined> {
  const identity = SupportedProviderIdentitySchema.safeParse(input.identity);
  const key = LicensedCapabilityKeySchema.safeParse(input.key);
  if (!identity.success || !key.success) return undefined;
  if (
    input.evidence.schemaVersion.trim() === "" ||
    evaluateModelTransfer(input.evidence.rightsSource).kind !== "allowed" ||
    input.evidence.rightsSource !== "insightsentry_rapidapi"
  )
    return undefined;
  timestampMillis(input.now);
  if (
    timestampMillis(input.evidence.retrievedAt) > timestampMillis(input.now) ||
    input.evidence.raw.runId !== input.evidence.normalized.runId ||
    input.evidence.raw.snapshotId !== input.evidence.normalized.snapshotId ||
    !input.evidence.normalized.parentDigests.includes(
      input.evidence.raw.digest,
    ) ||
    !(await descriptorIsCommitted(input.cas, input.evidence.raw)) ||
    !(await descriptorIsCommitted(input.cas, input.evidence.normalized))
  )
    return undefined;
  const fresh =
    timestampMillis(input.now) <= timestampMillis(input.evidence.freshThrough);
  const disclosure: CapabilityDisclosure = {
    key: key.data,
    state: fresh
      ? { availability: "available", source: "licensed_provider" }
      : {
          availability: "stale",
          source: "licensed_provider",
          staleSince: input.evidence.freshThrough,
        },
  };
  registerTrustedCapabilityDisclosure(disclosure);
  return Object.freeze(disclosure);
}
