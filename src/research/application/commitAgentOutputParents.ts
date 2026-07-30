import { hashBytes } from "../domain/contractHelpers";
import type { ArtifactId } from "../domain/ids";
import type {
  AgentOutputCommitBinding,
  TrustedAgentOutputEnvelope,
} from "../ports/agentOutputCommit";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { CitationLocatorSchema } from "./commitAgentOutputContracts";

type TrustedCitation = TrustedAgentOutputEnvelope["citations"][number];

async function verifyParent(
  cas: ArtifactCasPort,
  binding: AgentOutputCommitBinding,
  artifactId: ArtifactId,
): Promise<TrustedCitation | undefined> {
  const source = binding.citableArtifacts.find(
    (candidate) => candidate.artifactId === artifactId,
  );
  if (source === undefined || source.snapshotId !== binding.snapshotId)
    return undefined;
  const locator = CitationLocatorSchema.safeParse(source.locator);
  const digest = ArtifactDigestSchema.safeParse(source.contentHash);
  if (!locator.success || !digest.success) return undefined;
  const read = await cas.get(digest.data);
  if (
    read === undefined ||
    read.descriptor.digest !== digest.data ||
    read.descriptor.byteLength !== read.bytes.byteLength ||
    hashBytes(read.bytes) !== source.contentHash
  )
    return undefined;
  return {
    artifactId: source.artifactId,
    contentHash: source.contentHash,
    locator: locator.data,
  };
}

export async function verifyCitedParents(
  cas: ArtifactCasPort,
  binding: AgentOutputCommitBinding,
  artifactIds: readonly ArtifactId[],
): Promise<readonly TrustedCitation[] | undefined> {
  const citations = await Promise.all(
    artifactIds.map(
      async (artifactId) => await verifyParent(cas, binding, artifactId),
    ),
  );
  return citations.some((citation) => citation === undefined)
    ? undefined
    : citations.flatMap((citation) =>
        citation === undefined ? [] : [citation],
      );
}
