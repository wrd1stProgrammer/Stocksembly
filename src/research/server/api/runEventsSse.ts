import { RunIdSchema } from "../../domain/ids";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { apiError } from "./researchApiResponses";
import { RunEventNotifications } from "./runEventNotifications";
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
  readonly #notifications: RunEventNotifications;
  readonly #service = new AbortController();
  readonly #pollIntervalMs: number;
  readonly #heartbeatIntervalMs: number;

  constructor(options: {
    readonly database: ResearchDatabase;

    readonly pollIntervalMs?: number;
    readonly heartbeatIntervalMs?: number;
  }) {
    this.#repository = new RunEventsSseRepository(options);
    this.#notifications = new RunEventNotifications(options.database, (runId) =>
      this.#repository.invalidate(runId),
    );
    this.#pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  }

  async response(
    request: Request,
    principalId: string,
    runId: string,
    onTerminal?: () => Promise<void>,
  ): Promise<Response> {
    if (!RunIdSchema.safeParse(runId).success)
      return apiError(404, "NOT_FOUND");
    const parsed = resolveSseCursor(request);
    if (parsed.kind === "invalid") return apiError(400, "EVENT_CURSOR_INVALID");
    const watch = this.#notifications.watch(runId);
    try {
      const snapshot = await this.#repository.snapshot(
        principalId,
        runId,
        parsed.cursor,
      );
      if (snapshot === undefined) {
        watch.close();
        return apiError(404, "NOT_FOUND");
      }
      if (parsed.cursor > snapshot.lastEventSeq) {
        watch.close();
        return apiError(400, "EVENT_CURSOR_INVALID");
      }
      const earliestAvailable =
        snapshot.minimumEventSeq ?? snapshot.lastEventSeq + 1;
      if (parsed.cursor < earliestAvailable - 1 || !snapshot.lineageComplete) {
        watch.close();
        return apiError(410, "EVENT_LINEAGE_PRUNED");
      }
      return new Response(
        createRunEventsStream({
          repository: this.#repository,
          watch,
          principalId,
          runId,
          cursor: parsed.cursor,
          initial: snapshot,
          requestSignal: request.signal,
          serviceSignal: this.#service.signal,
          pollIntervalMs: this.#pollIntervalMs,
          heartbeatIntervalMs: this.#heartbeatIntervalMs,
          ...(onTerminal === undefined ? {} : { onTerminal }),
        }),
        { headers: responseHeaders },
      );
    } catch (error) {
      watch.close();
      throw error;
    }
  }

  close(): void {
    this.#service.abort();
    this.#notifications.close();
    this.#repository.close();
  }
}
