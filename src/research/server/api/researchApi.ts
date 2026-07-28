import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  attachQuestionExternalApiEvidence,
  questionLookupPlan,
} from "../../domain/questionLookupPlan";
import {
  ensureLocalAuth,
  type LocalAuth,
  rotateLocalAuth,
} from "../http/localAuth";
import { enforceRequestPolicy } from "../http/requestPolicy";
import { questionInputHash } from "../qa/questionAnswerContracts";
import { collectQuestionMarketEvidence } from "../qa/questionMarketEvidence";
import type { PublicReportLoader } from "./researchApiContracts";
import { createRun } from "./researchApiCreation";
import { decodeRunCursor, encodeRunCursor } from "./researchApiCursor";
import { ResearchApiRepository } from "./researchApiRepository";
import { apiError, apiJson } from "./researchApiResponses";
import { handleResearchCommand } from "./researchCommandHandler";
import { ResearchCommandRepository } from "./researchCommandRepository";
import { RunEventsSse } from "./runEventsSse";

const UuidSchema = z.string().uuid();

export type CreateResearchApiOptions = {
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly allowedHost: string;
  readonly allowedOrigin: string;
  readonly readiness: () => Promise<boolean>;
  readonly availableDiskBytes: () => Promise<number>;
  readonly loadReport?: PublicReportLoader;
  readonly now?: () => string;
  readonly createId?: () => string;
  readonly resolveSymbol?: (
    symbol: string,
  ) => Promise<
    "supported" | "unsupported" | "etf" | "ambiguous" | "unavailable"
  >;
};

export interface ResearchApi {
  readonly automationTokenPath: string;
  readonly bootstrapSession: () => Promise<string>;
  readonly bootstrapSessionResponse: (request: Request) => Promise<Response>;
  readonly rotateIdentity: () => Promise<void>;
  readonly handle: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

type ApiContext = {
  readonly options: CreateResearchApiOptions;
  readonly repository: ResearchApiRepository;
  readonly commands: ResearchCommandRepository;
  readonly runEvents: RunEventsSse;
  localAuth: LocalAuth;
};

function mutationFor(request: Request): boolean {
  return request.method !== "GET" && request.method !== "HEAD";
}

function policyError(status: 403 | 413 | 415): Response {
  switch (status) {
    case 403:
      return apiError(403, "REQUEST_FORBIDDEN");
    case 413:
      return apiError(413, "BODY_TOO_LARGE");
    case 415:
      return apiError(415, "CONTENT_TYPE_UNSUPPORTED");
  }
}

function listRuns(
  context: ApiContext,
  request: Request,
  principal: string,
): Response {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit") ?? "20";
  const limit = Number.parseInt(limitRaw, 10);
  if (!/^\d+$/.test(limitRaw) || limit < 1 || limit > 50)
    return apiError(400, "CURSOR_INVALID");
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = decodeRunCursor(cursorRaw);
  if (cursorRaw !== null && cursor === undefined)
    return apiError(400, "CURSOR_INVALID");
  const values = context.repository.listRuns(principal, limit + 1, cursor);
  const runs = values.slice(0, limit);
  const last = runs.at(-1);
  return apiJson({
    runs,
    ...(values.length <= limit || last === undefined
      ? {}
      : { nextCursor: encodeRunCursor(last) }),
  });
}

function runDetail(
  context: ApiContext,
  principal: string,
  runId: string,
): Response {
  if (!UuidSchema.safeParse(runId).success) return apiError(404, "NOT_FOUND");
  const detail = context.repository.detail(principal, runId);
  return detail === undefined ? apiError(404, "NOT_FOUND") : apiJson(detail);
}

async function reportDetail(
  context: ApiContext,
  principal: string,
  reportId: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(reportId).success)
    return apiError(404, "NOT_FOUND");
  const report = context.repository.report(principal, reportId);
  if (report === undefined) return apiError(404, "NOT_FOUND");
  if (context.options.loadReport === undefined)
    return apiJson({ report: report.payload });
  const loaded = await context.options.loadReport(report);
  return loaded === undefined
    ? apiError(404, "NOT_FOUND")
    : apiJson({ report: loaded });
}

async function dispatch(
  context: ApiContext,
  request: Request,
  principal: string,
): Promise<Response> {
  const command = await handleResearchCommand({
    request,
    principalId: principal,
    repository: context.commands,
    now: context.options.now ?? (() => new Date().toISOString()),
    createId: context.options.createId ?? randomUUID,
    prepareQuestion: async (reportId, questionId, question) => {
      const publication = context.repository.report(principal, reportId);
      if (publication === undefined || context.options.loadReport === undefined)
        return undefined;
      const report = await context.options.loadReport(publication);
      if (report === undefined) return undefined;
      const plan = questionLookupPlan(question);
      const marketEvidence = plan.useMarketApi
        ? await collectQuestionMarketEvidence({
            dataRoot: context.options.dataRoot,
            providerCode: report.marketSnapshot?.providerCode,
          })
        : undefined;
      const preparedQuestion =
        marketEvidence === undefined
          ? question
          : attachQuestionExternalApiEvidence(question, marketEvidence);
      return {
        reportVersionId: report.versionId,
        reportArtifactDigest: publication.artifactDigest,
        inputHash: questionInputHash(report, questionId, preparedQuestion),
        question: preparedQuestion,
      };
    },
  });
  if (command !== undefined) return command;
  const path = new URL(request.url).pathname;
  if (path === "/api/research/runs") {
    if (request.method === "GET") return listRuns(context, request, principal);
    if (request.method === "POST")
      return await createRun(context, request, principal);
    return apiError(405, "METHOD_NOT_ALLOWED");
  }
  const run = path.match(/^\/api\/research\/runs\/([^/]+)$/)?.[1];
  if (run !== undefined && request.method === "GET")
    return runDetail(context, principal, run);
  const runEvents = path.match(/^\/api\/research\/runs\/([^/]+)\/events$/)?.[1];
  if (runEvents !== undefined && request.method === "GET")
    return context.runEvents.response(request, principal, runEvents);
  const report = path.match(/^\/api\/research\/reports\/([^/]+)$/)?.[1];
  if (report !== undefined && request.method === "GET")
    return await reportDetail(context, principal, report);
  return apiError(404, "NOT_FOUND");
}

export async function createResearchApi(
  options: CreateResearchApiOptions,
): Promise<ResearchApi> {
  const context: ApiContext = {
    options,
    repository: new ResearchApiRepository({
      databasePath: options.databasePath,
      ...(options.migrationsDirectory === undefined
        ? {}
        : { migrationsDirectory: options.migrationsDirectory }),
    }),
    commands: new ResearchCommandRepository({
      databasePath: options.databasePath,
      ...(options.migrationsDirectory === undefined
        ? {}
        : { migrationsDirectory: options.migrationsDirectory }),
    }),
    runEvents: new RunEventsSse({
      databasePath: options.databasePath,
      ...(options.migrationsDirectory === undefined
        ? {}
        : { migrationsDirectory: options.migrationsDirectory }),
    }),
    localAuth: await ensureLocalAuth(options.dataRoot),
  };
  const bootstrapSession = () =>
    Promise.resolve(context.localAuth.createBootstrapCookie());
  return {
    get automationTokenPath() {
      return context.localAuth.automationTokenPath;
    },
    bootstrapSession,
    async bootstrapSessionResponse(request) {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED");
      const policy = await enforceRequestPolicy(request, {
        mutation: false,
        allowedHost: options.allowedHost,
        allowedOrigin: options.allowedOrigin,
      });
      if (policy.kind === "rejected") return policyError(policy.status);
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie": await bootstrapSession(),
        },
      });
    },
    async rotateIdentity() {
      context.localAuth = await rotateLocalAuth(options.dataRoot);
    },
    async handle(request) {
      const policy = await enforceRequestPolicy(request, {
        mutation: mutationFor(request),
        allowedHost: options.allowedHost,
        allowedOrigin: options.allowedOrigin,
      });
      if (policy.kind === "rejected") return policyError(policy.status);
      const authentication = context.localAuth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      return await dispatch(context, request, authentication.principal.id);
    },
    close: () => {
      context.runEvents.close();
      context.commands.close();
      context.repository.close();
      return Promise.resolve();
    },
  };
}
