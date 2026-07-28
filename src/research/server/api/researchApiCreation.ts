import { randomUUID } from "node:crypto";
import { checkCommandBodySize, checkDiskAdmission } from "../../domain/limits";
import { parseIdempotencyKey, parseResearchInput } from "./researchApiInput";
import type { ResearchApiRepository } from "./researchApiRepository";
import { apiError, apiJson } from "./researchApiResponses";

const BODY_LIMIT = 64 * 1024;

type CreationContext = {
  readonly options: {
    readonly readiness: () => Promise<boolean>;
    readonly availableDiskBytes: () => Promise<number>;
    readonly now?: () => string;
    readonly createId?: () => string;
    readonly resolveSymbol?: (
      symbol: string,
    ) => Promise<
      "supported" | "unsupported" | "etf" | "ambiguous" | "unavailable"
    >;
  };
  readonly repository: ResearchApiRepository;
};

function inputError(
  kind: Exclude<ReturnType<typeof parseResearchInput>["kind"], "accepted">,
): Response {
  switch (kind) {
    case "request_invalid":
      return apiError(400, "REQUEST_INVALID");
    case "symbol_invalid":
      return apiError(400, "SYMBOL_INVALID");
    case "question_invalid":
      return apiError(400, "QUESTION_INVALID");
  }
}

async function parseBody(request: Request): Promise<unknown | Response> {
  if (request.headers.get("content-type") !== "application/json")
    return apiError(415, "CONTENT_TYPE_UNSUPPORTED");
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number.parseInt(declared, 10);
    if (!Number.isInteger(bytes) || bytes < 0)
      return apiError(400, "BODY_INVALID");
    if (bytes > BODY_LIMIT) return apiError(413, "BODY_TOO_LARGE");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (checkCommandBodySize(bytes).kind !== "accepted")
    return apiError(413, "BODY_TOO_LARGE");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      return apiError(400, "BODY_INVALID");
    throw error;
  }
}

export async function createRun(
  context: CreationContext,
  request: Request,
  principal: string,
): Promise<Response> {
  const key = parseIdempotencyKey(request.headers.get("idempotency-key"));
  if (key === undefined) return apiError(400, "IDEMPOTENCY_KEY_INVALID");
  const body = await parseBody(request);
  if (body instanceof Response) return body;
  const parsed = parseResearchInput(body);
  if (parsed.kind !== "accepted") return inputError(parsed.kind);
  const previous = context.repository.lookupIdempotency(
    principal,
    key,
    parsed.request,
  );
  if (previous.kind === "replayed") return apiJson({ run: previous.run }, 202);
  if (previous.kind === "conflict")
    return apiError(409, "IDEMPOTENCY_CONFLICT");
  const symbolResolution =
    (await context.options.resolveSymbol?.(parsed.request.symbol)) ??
    "supported";
  switch (symbolResolution) {
    case "unsupported":
      return apiError(400, "SYMBOL_UNSUPPORTED");
    case "etf":
      return apiError(400, "ETF_UNSUPPORTED");
    case "ambiguous":
      return apiError(409, "SYMBOL_AMBIGUOUS");
    case "unavailable":
      return apiError(503, "TICKER_CATALOG_UNAVAILABLE");
    case "supported":
      break;
  }
  if (!(await context.options.readiness()))
    return apiError(503, "RESEARCH_UNREADY");
  if (
    checkDiskAdmission(await context.options.availableDiskBytes()).kind !==
    "accepted"
  ) {
    return apiError(507, "DISK_LOW");
  }
  const createId = context.options.createId ?? randomUUID;
  const result = context.repository.create({
    principalId: principal,
    idempotencyKey: key,
    request: parsed.request,
    ids: {
      runId: createId(),
      snapshotId: createId(),
      jobId: createId(),
      eventId: createId(),
    },
    now: (context.options.now ?? (() => new Date().toISOString()))(),
  });
  switch (result.kind) {
    case "created":
    case "replayed":
      return apiJson({ run: result.run }, 202);
    case "idempotency_conflict":
      return apiError(409, "IDEMPOTENCY_CONFLICT");
    case "queue_full":
      return apiError(503, "QUEUE_FULL");
  }
}
