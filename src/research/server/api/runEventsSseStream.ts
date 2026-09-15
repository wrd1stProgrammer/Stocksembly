import type { PublicResearchEvent } from "./researchApiContracts";
import type { RunEventWatch } from "./runEventNotifications";
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

export function createRunEventsStream(input: {
  readonly repository: RunEventsSseRepository;
  readonly watch: RunEventWatch;
  readonly principalId: string;
  readonly runId: string;
  readonly cursor: number;
  readonly initial: RunEventSnapshot;
  readonly requestSignal: AbortSignal;
  readonly serviceSignal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs: number;
  readonly onTerminal?: () => Promise<void>;
}): ReadableStream<Uint8Array> {
  let cursor = input.cursor;
  let snapshot = input.initial;
  let queue = [...snapshot.entries];
  let lastHeartbeat = Date.now();
  let lastRead = Date.now();
  let disposed = input.requestSignal.aborted || input.serviceSignal.aborted;
  let terminalHandled = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    input.watch.close();
    input.requestSignal.removeEventListener("abort", dispose);
    input.serviceSignal.removeEventListener("abort", dispose);
  };
  if (disposed) input.watch.close();
  if (!disposed) {
    input.requestSignal.addEventListener("abort", dispose, { once: true });
    input.serviceSignal.addEventListener("abort", dispose, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!disposed) {
          const entry = queue.shift();
          if (entry !== undefined) {
            cursor = entrySequence(entry);
            controller.enqueue(entryFrame(entry));
            return;
          }
          if (terminal(snapshot) && cursor >= snapshot.lastEventSeq) {
            if (!terminalHandled) {
              terminalHandled = true;
              await input.onTerminal?.();
            }
            dispose();
            controller.close();
            return;
          }
          const changed = await input.watch.wait(
            Math.max(
              1,
              Math.min(
                input.pollIntervalMs - (Date.now() - lastRead),
                input.heartbeatIntervalMs - (Date.now() - lastHeartbeat),
              ),
            ),
            [input.requestSignal, input.serviceSignal],
          );
          if (disposed) break;
          if (changed || Date.now() - lastRead >= input.pollIntervalMs) {
            const next = await input.repository.snapshot(
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
            lastRead = Date.now();
          }
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
      } catch (error) {
        dispose();
        controller.error(error);
      }
    },
    cancel: dispose,
  });
}
