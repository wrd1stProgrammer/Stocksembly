import { isValidWorkflowIntentId } from "./workflowV1Boundaries";
import type {
  WorkflowV1InvalidReason,
  WorkflowV1LedgerEntry,
} from "./workflowV1Contracts";

type IntentState = {
  readonly cancellationIntentId: string | null;
  readonly failureIntentId: string | null;
  readonly failureReason: string | null;
};

export type IntentDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "reject"; readonly reason: WorkflowV1InvalidReason };

export function terminalIntentDecision(
  state: IntentState,
  event: WorkflowV1LedgerEntry,
): IntentDecision {
  if (state.cancellationIntentId !== null) {
    if (event.type === "cancel_requested")
      return event.intentId === state.cancellationIntentId
        ? { kind: "duplicate" }
        : { kind: "reject", reason: "terminal_intent_conflict" };
    if (event.type === "failure_requested")
      return { kind: "reject", reason: "terminal_intent_conflict" };
    return event.type === "launch_finished" || event.type === "run_cancelled"
      ? { kind: "allow" }
      : { kind: "reject", reason: "terminal_intent_fenced" };
  }
  if (state.failureIntentId !== null) {
    if (event.type === "failure_requested")
      return event.intentId === state.failureIntentId &&
        event.reason === state.failureReason
        ? { kind: "duplicate" }
        : { kind: "reject", reason: "terminal_intent_conflict" };
    if (event.type === "cancel_requested")
      return { kind: "reject", reason: "terminal_intent_conflict" };
    return event.type === "launch_finished" || event.type === "run_failed"
      ? { kind: "allow" }
      : { kind: "reject", reason: "terminal_intent_fenced" };
  }
  return { kind: "allow" };
}

export function canAcceptFailureIntent(
  event: Extract<WorkflowV1LedgerEntry, { readonly type: "failure_requested" }>,
  state: {
    readonly failureReason: string | null;
    readonly cancellationIntentId: string | null;
  },
): boolean {
  return (
    state.failureReason === null &&
    state.cancellationIntentId === null &&
    isValidWorkflowIntentId(event.intentId) &&
    event.reason.length > 0
  );
}

export function canFinalizeFailure(
  event: Extract<WorkflowV1LedgerEntry, { readonly type: "run_failed" }>,
  state: {
    readonly failureIntentId: string | null;
    readonly failureReason: string | null;
    readonly pendingCount: number;
  },
): boolean {
  return (
    state.failureIntentId !== null &&
    event.reason === state.failureReason &&
    state.pendingCount === 0
  );
}

export type TerminalEntryDecision =
  | { readonly kind: "not_terminal" }
  | { readonly kind: "reject"; readonly reason: WorkflowV1InvalidReason }
  | {
      readonly kind: "update";
      readonly cancellationIntentId: string | null;
      readonly failureIntentId: string | null;
      readonly failureReason: string | null;
      readonly terminal: "cancelled" | "failed" | "incomplete" | null;
    };

export function reduceTerminalEntry(
  event: WorkflowV1LedgerEntry,
  state: {
    readonly cancellationIntentId: string | null;
    readonly failureIntentId: string | null;
    readonly failureReason: string | null;
    readonly pendingCount: number;
  },
): TerminalEntryDecision {
  if (event.type === "cancel_requested")
    return isValidWorkflowIntentId(event.intentId)
      ? {
          ...state,
          kind: "update",
          cancellationIntentId: event.intentId,
          terminal: null,
        }
      : { kind: "reject", reason: "terminal_intent_invalid" };
  if (event.type === "failure_requested")
    return canAcceptFailureIntent(event, state)
      ? {
          ...state,
          kind: "update",
          failureIntentId: event.intentId,
          failureReason: event.reason,
          terminal: null,
        }
      : { kind: "reject", reason: "terminal_intent_invalid" };
  if (event.type === "run_cancelled")
    return state.cancellationIntentId !== null && state.pendingCount === 0
      ? { ...state, kind: "update", terminal: "cancelled" }
      : { kind: "reject", reason: "event_order_invalid" };
  if (event.type === "run_failed")
    return canFinalizeFailure(event, state)
      ? { ...state, kind: "update", terminal: "failed" }
      : { kind: "reject", reason: "event_order_invalid" };
  if (event.type === "run_incomplete")
    return state.pendingCount === 0
      ? { ...state, kind: "update", terminal: "incomplete" }
      : { kind: "reject", reason: "event_order_invalid" };
  return { kind: "not_terminal" };
}
