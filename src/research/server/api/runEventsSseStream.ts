import type { PublicResearchEvent } from "./researchApiContracts";
import type {
  RunEventSnapshot,
  RunEventStreamEntry,
  RunEventsSseRepository,
} from "./runEventsSseRepository";

const TERMINAL_STATUSES = new Set([
  "completed",
  "complete-with-limitations",
  "cancelled",
  "failed",
  "incomplete",
]);
const encoder = new TextEncoder();

function frame(event: PublicResearchEvent): Uint8Array {
  return encoder.encode(
    `id: ${event.sequence}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

function cursorFrame(sequence: number): Uint8Array {
  return encoder.encode(`id: ${sequence}\n\n`);
}

function entrySequence(entry: RunEventStreamEntry): number {
  return entry.kind === "public" ? entry.event.sequence : entry.sequence;
}

function entryFrame(entry: RunEventStreamEntry): Uint8Array {
  return entry.kind === "public"
    ? frame(entry.event)
    : cursorFrame(entry.sequence);
}

function terminal(snapshot: RunEventSnapshot): boolean {
  return TERMINAL_STATUSES.has(snapshot.status);
}

function wait(milliseconds: number, signals: readonly AbortSignal[]) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    for (const signal of signals)
      signal.addEventListener("abort", finish, { once: true });
  });
}

export function createRunEventsStream(input: {
  readonly repository: RunEventsSseRepository;
  readonly principalId: string;
  readonly runId: string;
  readonly cursor: number;
  readonly initial: RunEventSnapshot;
  readonly requestSignal: AbortSignal;
  readonly serviceSignal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs: number;
}): ReadableStream<Uint8Array> {
  let cursor = input.cursor;
  let snapshot = input.initial;
  let queue = [...snapshot.entries];
  let lastHeartbeat = Date.now();
  let disposed = input.requestSignal.aborted || input.serviceSignal.aborted;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    input.requestSignal.removeEventListener("abort", dispose);
    input.serviceSignal.removeEventListener("abort", dispose);
  };
  if (!disposed) {
    input.requestSignal.addEventListener("abort", dispose, { once: true });
    input.serviceSignal.addEventListener("abort", dispose, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (!disposed) {
        const entry = queue.shift();
        if (entry !== undefined) {
          cursor = entrySequence(entry);
          controller.enqueue(entryFrame(entry));
          return;
        }
        if (terminal(snapshot) && cursor >= snapshot.lastEventSeq) {
          dispose();
          controller.close();
          return;
        }
        await wait(input.pollIntervalMs, [
          input.requestSignal,
          input.serviceSignal,
        ]);
        if (disposed) break;
        const next = input.repository.snapshot(
          input.principalId,
          input.runId,
          cursor,
        );
        if (next === undefined || !next.lineageComplete) {
          dispose();
          controller.error(
            new TypeError("Durable event lineage became unavailable"),
          );
          return;
        }
        snapshot = next;
        queue = [...next.entries];
        const now = Date.now();
        if (
          queue.length === 0 &&
          now - lastHeartbeat >= input.heartbeatIntervalMs
        ) {
          lastHeartbeat = now;
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
          return;
        }
      }
      controller.close();
    },
    cancel: dispose,
  });
}
