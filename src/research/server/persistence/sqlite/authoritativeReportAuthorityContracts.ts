import { z } from "zod";
import {
  REQUIRED_REPORT_ARTIFACT_ROLES,
  WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS,
} from "../../../domain/report";

export const AuthoritativeRunSchema = z.object({
  snapshot_id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  status: z.literal("running"),
  report_id: z.null(),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
});

export function reportRoleFor(logicalKey: string) {
  return REQUIRED_REPORT_ARTIFACT_ROLES.find(
    (role) => WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS[role] === logicalKey,
  );
}
