import { parseWorkflowEventDraft } from "../../../workflow/publicEventsContracts";
import { serializeSafeJson } from "./safeJson";

export type CancellationEventKind = "run_cancelling" | "run_cancelled";

const summaries: Record<
  CancellationEventKind,
  { readonly en: string; readonly ko: string }
> = {
  run_cancelling: {
    en: "Cancellation was requested. Active research work is stopping.",
    ko: "취소가 요청되었습니다. 진행 중인 리서치 작업을 중지하고 있습니다.",
  },
  run_cancelled: {
    en: "The research run was cancelled.",
    ko: "리서치 실행이 취소되었습니다.",
  },
};

export function cancellationPublicEvent(input: {
  readonly eventId: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly sequence: number;
  readonly kind: CancellationEventKind;
  readonly occurredAt: string;
}) {
  const draft = parseWorkflowEventDraft({
    ...input,
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
    summary: summaries[input.kind],
  });
  if (draft === undefined)
    throw new Error(`Invalid ${input.kind} public event`);
  return {
    ...draft,
    stateId: input.kind === "run_cancelling" ? "cancelling" : "cancelled",
    payloadJson: serializeSafeJson({
      schemaVersion: "workflow-v1",
      participantIds: draft.participantIds,
      claimIds: draft.claimIds,
      sourceIds: draft.sourceIds,
      limitationIds: draft.limitationIds,
      summary: draft.summary,
    }),
  } as const;
}
