import { z } from "zod";
import { hashCanonical } from "../domain/contractHelpers";
import { repairDepartmentPublication } from "./departmentPublicationRepair";
import { DepartmentJobPromptSchema } from "./departmentRoundContracts";
import { inspectDepartmentCandidate } from "./departmentRoundOutput";

const ObjectSchema = z.record(z.string(), z.unknown());

export function reconcileDepartmentResponse(prompt: string, input: unknown) {
  const request = DepartmentJobPromptSchema.safeParse(JSON.parse(prompt));
  if (!request.success) return input;
  const object = ObjectSchema.safeParse(input);
  const candidate = object.success ? { ...object.data } : {};
  delete candidate["publicationMode"];
  candidate["sourceArtifactIds"] = request.data.memberArtifacts.map(
    (member) => member.artifactId,
  );
  const dispositions = z
    .array(ObjectSchema)
    .safeParse(candidate["dispositions"]);
  const revisions = z.array(ObjectSchema).safeParse(candidate["revisions"]);
  if (dispositions.success && revisions.success) {
    const reasons = new Map(
      dispositions.data.map((item) => [item["claimId"], item["reason"]]),
    );
    const positions = new Map<
      string,
      (typeof request.data.memberArtifacts)[number]["memo"]["positions"][number]
    >(
      request.data.memberArtifacts.flatMap((member) =>
        member.memo.positions.map((position) => [position.claimId, position]),
      ),
    );
    candidate["revisions"] = revisions.data.map((revision) => {
      const origin = revision["originClaimId"];
      const position =
        typeof origin === "string" ? positions.get(origin) : undefined;
      if (!position) return revision;
      const repaired = {
        ...revision,
        adjudicatedClaimId: origin,
        reason: reasons.get(origin),
        sourceArtifactIds: position.evidenceArtifactIds,
      };
      return { ...repaired, revisionHash: hashCanonical(repaired) };
    });
    for (const [field, disposition] of [
      ["acceptedClaimIds", "accept"],
      ["revisedClaimIds", "revise"],
      ["removedClaimIds", "remove"],
    ] as const) {
      candidate[field] = dispositions.data
        .filter((item) => item["disposition"] === disposition)
        .map((item) => item["claimId"]);
    }
  }
  const job = { prompt };
  const inspected = inspectDepartmentCandidate(job, candidate);
  const recovered = inspected ?? repairDepartmentPublication(job, candidate);
  if (!recovered) return candidate;
  if (request.data.decisionContract === "coherent-decision-v1")
    return recovered;
  const { decisionPacket: _decisionPacket, ...legacy } = recovered;
  return legacy;
}
