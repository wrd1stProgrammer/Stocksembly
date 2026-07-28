import { z } from "zod";
import {
  type RunId,
  RunIdSchema,
  type SnapshotId,
  SnapshotIdSchema,
} from "./ids";

export const RunLineageSchema = z
  .object({
    kind: z.enum(["same-snapshot-retry", "new-snapshot-follow-up"]),
    parentRunId: RunIdSchema,
    parentSnapshotId: SnapshotIdSchema,
  })
  .strict();
export type RunLineage = z.infer<typeof RunLineageSchema>;
export type CreateChildRunInput = {
  readonly childRunId: string;
  readonly kind: RunLineage["kind"];
  readonly snapshotId?: string;
  readonly createdAt?: string;
};
export type ChildRunData = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly status: "queued";
  readonly createdAt: string;
  readonly eventSeq: 0;
  readonly lineage: RunLineage;
};
export type ChildRunDataResult =
  | { readonly ok: true; readonly data: ChildRunData }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: "invalid_lineage";
        readonly message: string;
      };
    };
export type ParentRunData = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly status: string;
  readonly createdAt: string;
};

export function createChildRunData(
  parent: ParentRunData,
  input: CreateChildRunInput,
): ChildRunDataResult {
  const terminal = new Set([
    "completed",
    "complete-with-limitations",
    "cancelled",
    "failed",
    "incomplete",
  ]);
  if (!terminal.has(parent.status))
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "only terminal runs may create children",
      },
    };
  const snapshotId = input.snapshotId ?? parent.snapshotId;
  if (input.kind === "same-snapshot-retry" && snapshotId !== parent.snapshotId)
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "same-snapshot retry must reuse its parent snapshot",
      },
    };
  if (
    input.kind === "new-snapshot-follow-up" &&
    snapshotId === parent.snapshotId
  )
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "follow-up must seal a new snapshot",
      },
    };
  return {
    ok: true,
    data: {
      runId: RunIdSchema.parse(input.childRunId),
      snapshotId: SnapshotIdSchema.parse(snapshotId),
      status: "queued",
      createdAt: input.createdAt ?? parent.createdAt,
      eventSeq: 0,
      lineage: RunLineageSchema.parse({
        kind: input.kind,
        parentRunId: parent.runId,
        parentSnapshotId: parent.snapshotId,
      }),
    },
  };
}
