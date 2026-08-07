import { z } from "zod";
import { checkCommandBodySize } from "../../domain/limits";
import { parseIdempotencyKey } from "./researchApiInput";
import { apiError, apiJson } from "./researchApiResponses";
import type {
  PublicQuestion,
  QuestionGrounding,
} from "./researchCommandContracts";
import {
  parseEmptyCommand,
  parseFollowUpCommand,
  parseQuestionCommand,
  requiresFollowUpResearch,
} from "./researchCommandInput";
import type { ResearchCommandRepository } from "./researchCommandRepository";

const UuidSchema = z.string().uuid();

type HandlerContext = {
  readonly request: Request;
  readonly principalId: string;
  readonly repository: ResearchCommandRepository;
  readonly now: () => string;
  readonly createId: () => string;
  readonly prepareQuestion: (
    reportId: string,
    questionId: string,
    question: { readonly en: string; readonly ko: string },
  ) => Promise<QuestionGrounding | undefined>;
  readonly beforeQuestion?: () => Promise<boolean>;
  readonly onQuestion?: (question: PublicQuestion) => Promise<void>;
  readonly beforeRetry?: (
    parentRunId: string,
    childRunId: string,
  ) => Promise<boolean>;
  readonly releaseRetry?: (childRunId: string) => Promise<void>;
  readonly onRetry?: (childRunId: string) => Promise<void>;
};

async function commandBody(request: Request): Promise<unknown | Response> {
  if (request.headers.get("content-type") !== "application/json")
    return apiError(415, "CONTENT_TYPE_UNSUPPORTED");
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

function commandContext(context: HandlerContext, key: string) {
  return {
    principalId: context.principalId,
    idempotencyKey: key,
    now: context.now(),
    ids: {
      runId: context.createId(),
      snapshotId: context.createId(),
      jobId: context.createId(),
      eventId: context.createId(),
      questionId: context.createId(),
    },
  } as const;
}

function commandFailure(kind: string): Response {
  switch (kind) {
    case "conflict":
      return apiError(409, "IDEMPOTENCY_CONFLICT");
    case "not_found":
      return apiError(404, "NOT_FOUND");
    case "quota_exhausted":
      return apiError(409, "QUESTION_QUOTA_EXHAUSTED");
    case "active_question":
      return apiError(409, "QUESTION_ACTIVE");
    default:
      return apiError(409, "COMMAND_NOT_ALLOWED");
  }
}

async function handleMutation(
  context: HandlerContext,
  target: {
    readonly kind: "cancel" | "retry" | "follow_up" | "question";
    readonly id: string;
  },
): Promise<Response> {
  const key = parseIdempotencyKey(
    context.request.headers.get("idempotency-key"),
  );
  if (key === undefined) return apiError(400, "IDEMPOTENCY_KEY_INVALID");
  const body = await commandBody(context.request);
  if (body instanceof Response) return body;
  const command = commandContext(context, key);
  if (target.kind === "cancel") {
    const parsed = parseEmptyCommand(body);
    if (!parsed.success) return apiError(400, "REQUEST_INVALID");
    const result = context.repository.cancel(target.id, command);
    if (result.kind !== "created" && result.kind !== "replayed")
      return commandFailure(result.kind);
    return apiJson(
      { run: result.value },
      result.value.status === "cancelled" ? 200 : 202,
    );
  }
  if (target.kind === "retry") {
    const parsed = parseEmptyCommand(body);
    if (!parsed.success) return apiError(400, "REQUEST_INVALID");
    const replay = context.repository.replayRetry(
      target.id,
      context.principalId,
      key,
    );
    if (replay.kind === "conflict") return commandFailure("conflict");
    if (replay.kind === "replayed") {
      await context.onRetry?.(replay.value.runId);
      return apiJson({ run: replay.value }, 202);
    }
    if (
      context.beforeRetry !== undefined &&
      !(await context.beforeRetry(target.id, command.ids.runId))
    ) {
      const lateReplay = context.repository.replayRetry(
        target.id,
        context.principalId,
        key,
      );
      if (lateReplay.kind === "replayed") {
        await context.onRetry?.(lateReplay.value.runId);
        return apiJson({ run: lateReplay.value }, 202);
      }
      return apiError(402, "CREDITS_INSUFFICIENT");
    }
    const result = context.repository.retry(target.id, command);
    if (result.kind !== "created" && result.kind !== "replayed") {
      await context.releaseRetry?.(command.ids.runId);
      return commandFailure(result.kind);
    }
    if (result.value.runId !== command.ids.runId)
      await context.releaseRetry?.(command.ids.runId);
    await context.onRetry?.(result.value.runId);
    return apiJson({ run: result.value }, 202);
  }
  if (target.kind === "follow_up") {
    const parsed = parseFollowUpCommand(body);
    if (!parsed.success) return apiError(400, "REQUEST_INVALID");
    const result = context.repository.followUp(target.id, parsed.data, command);
    return result.kind === "created" || result.kind === "replayed"
      ? apiJson({ run: result.value }, 202)
      : commandFailure(result.kind);
  }
  const parsed = parseQuestionCommand(body);
  if (!parsed.success) return apiError(400, "QUESTION_INVALID");
  const replay = context.repository.replayQuestion(
    target.id,
    parsed.data,
    command,
  );
  if (replay.kind !== "missing")
    return replay.kind === "created" || replay.kind === "replayed"
      ? apiJson({ question: replay.value }, 202)
      : commandFailure(replay.kind);
  if (requiresFollowUpResearch(parsed.data.question))
    return apiError(409, "FOLLOW_UP_REQUIRED");
  const grounding = await context.prepareQuestion(
    target.id,
    command.ids.questionId,
    {
      en: parsed.data.question,
      ko: parsed.data.question,
    },
  );
  if (grounding === undefined)
    return apiError(503, "QUESTION_GROUNDING_UNAVAILABLE");
  if (context.beforeQuestion !== undefined && !(await context.beforeQuestion()))
    return apiError(402, "CREDITS_INSUFFICIENT");
  const result = context.repository.createQuestion(
    target.id,
    parsed.data,
    grounding,
    command,
  );
  if (result.kind === "created" || result.kind === "replayed")
    await context.onQuestion?.(result.value);
  return result.kind === "created" || result.kind === "replayed"
    ? apiJson({ question: result.value }, 202)
    : commandFailure(result.kind);
}

export async function handleResearchCommand(
  context: HandlerContext,
): Promise<Response | undefined> {
  const path = new URL(context.request.url).pathname;
  const questionId = path.match(/^\/api\/research\/questions\/([^/]+)$/)?.[1];
  if (questionId !== undefined && context.request.method === "GET") {
    if (!UuidSchema.safeParse(questionId).success)
      return apiError(404, "NOT_FOUND");
    const question = context.repository.question(
      context.principalId,
      questionId,
    );
    if (question !== undefined) await context.onQuestion?.(question);
    return question === undefined
      ? apiError(404, "NOT_FOUND")
      : apiJson({ question });
  }
  if (context.request.method !== "POST") return undefined;
  const patterns = [
    ["cancel", /^\/api\/research\/runs\/([^/]+)\/cancel$/],
    ["retry", /^\/api\/research\/runs\/([^/]+)\/retries$/],
    ["follow_up", /^\/api\/research\/reports\/([^/]+)\/follow-ups$/],
    ["question", /^\/api\/research\/reports\/([^/]+)\/questions$/],
  ] as const;
  for (const [kind, pattern] of patterns) {
    const id = path.match(pattern)?.[1];
    if (id === undefined) continue;
    if (!UuidSchema.safeParse(id).success) return apiError(404, "NOT_FOUND");
    return await handleMutation(context, { kind, id });
  }
  return undefined;
}
