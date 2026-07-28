import { RunIdSchema } from "../../domain/ids";
import { apiError } from "./researchApiResponses";
import { resolveSseCursor } from "./runEventsSseCursor";
import { RunEventsSseRepository } from "./runEventsSseRepository";
import { createRunEventsStream } from "./runEventsSseStream";

const responseHeaders = {
  "cache-control": "no-store, no-transform",
  connection: "keep-alive",
  "content-type": "text/event-stream; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-accel-buffering": "no",
  "x-content-type-options": "nosniff",
} as const;

export class RunEventsSse {
  readonly #repository: RunEventsSseRepository;
  readonly #service = new AbortController();
  readonly #pollIntervalMs: number;
  readonly #heartbeatIntervalMs: number;

  constructor(options: {
    readonly databasePath: string;
    readonly migrationsDirectory?: string;
    readonly pollIntervalMs?: number;
    readonly heartbeatIntervalMs?: number;
  }) {
    this.#repository = new RunEventsSseRepository(options);
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  }

  response(request: Request, principalId: string, runId: string): Response {
    if (!RunIdSchema.safeParse(runId).success)
      return apiError(404, "NOT_FOUND");
    const parsed = resolveSseCursor(request);
    if (parsed.kind === "invalid") return apiError(400, "EVENT_CURSOR_INVALID");
    const snapshot = this.#repository.snapshot(
      principalId,
      runId,
      parsed.cursor,
    );
    if (snapshot === undefined) return apiError(404, "NOT_FOUND");
    if (parsed.cursor > snapshot.lastEventSeq)
      return apiError(400, "EVENT_CURSOR_INVALID");
    const earliestAvailable =
      snapshot.minimumEventSeq ?? snapshot.lastEventSeq + 1;
    if (parsed.cursor < earliestAvailable - 1 || !snapshot.lineageComplete) {
      return apiError(410, "EVENT_LINEAGE_PRUNED");
    }
    return new Response(
      createRunEventsStream({
        repository: this.#repository,
        principalId,
        runId,
        cursor: parsed.cursor,
        initial: snapshot,
        requestSignal: request.signal,
        serviceSignal: this.#service.signal,
        pollIntervalMs: this.#pollIntervalMs,
        heartbeatIntervalMs: this.#heartbeatIntervalMs,
      }),
      { headers: responseHeaders },
    );
  }

  close(): void {
    this.#service.abort();
    this.#repository.close();
  }
}
