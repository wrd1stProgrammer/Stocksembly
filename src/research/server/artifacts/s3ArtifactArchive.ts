import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactRead,
  ArtifactWrite,
} from "../../ports/artifacts";
import type { ArtifactMetadataTransactions } from "./filesystemArtifactStore.types";

type S3ArtifactArchiveOptions = {
  readonly bucket: string;
  readonly region: string;
};

export class S3ArtifactArchive {
  readonly #client: S3Client;

  constructor(private readonly options: S3ArtifactArchiveOptions) {
    this.#client = new S3Client({
      region: options.region,
      maxAttempts: 3,
    });
  }

  async put(descriptor: ArtifactDescriptor, bytes: Uint8Array): Promise<void> {
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey(descriptor.digest),
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: descriptor.mediaType,
          ChecksumSHA256: Buffer.from(descriptor.digest, "hex").toString(
            "base64",
          ),
          IfNoneMatch: "*",
          Metadata: {
            artifactId: descriptor.artifactId,
            runId: descriptor.runId,
            snapshotId: descriptor.snapshotId,
            digest: descriptor.digest,
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 412
      )
        return;
      throw error;
    }
  }

  async get(digest: ArtifactDigest): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey(digest),
        }),
      );
      if (response.Body === undefined) return undefined;
      const bytes = await response.Body.transformToByteArray();
      return digestFor(bytes) === digest ? bytes : undefined;
    } catch (error) {
      if (
        error instanceof NoSuchKey ||
        (error instanceof Error && error.name === "NoSuchKey")
      )
        return undefined;
      throw error;
    }
  }

  close(): void {
    this.#client.destroy();
  }
}

export class S3MirroredArtifactStore implements ArtifactCasPort {
  constructor(
    private readonly local: ArtifactCasPort,
    private readonly archive: S3ArtifactArchive,
    private readonly metadata: ArtifactMetadataTransactions,
  ) {}

  async put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    const descriptor = await this.local.put(artifact);
    await this.archive.put(descriptor, artifact.bytes);
    return descriptor;
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    const local = await this.local.get(digest);
    if (local !== undefined) return local;
    const [descriptor, bytes] = await Promise.all([
      this.metadata.find(digest),
      this.archive.get(digest),
    ]);
    if (
      descriptor === undefined ||
      bytes === undefined ||
      descriptor.byteLength !== bytes.byteLength
    )
      return undefined;
    const restored = await this.local.put({
      artifactId: descriptor.artifactId,
      runId: descriptor.runId,
      snapshotId: descriptor.snapshotId,
      mediaType: descriptor.mediaType,
      parentDigests: descriptor.parentDigests,
      bytes,
    });
    return { descriptor: restored, bytes };
  }

  async has(digest: ArtifactDigest): Promise<boolean> {
    return (await this.get(digest)) !== undefined;
  }
}

export function createLiveS3ArtifactArchive(): S3ArtifactArchive | undefined {
  const { AWS_REGION: region, STOCKSEMBLY_ARTIFACT_BUCKET: bucket } =
    process.env;
  return region && bucket
    ? new S3ArtifactArchive({ bucket, region })
    : undefined;
}

function objectKey(digest: ArtifactDigest): string {
  return `artifacts/sha256/${digest.slice(0, 2)}/${digest}`;
}

function digestFor(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
