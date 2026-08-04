import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type AccountStore,
  AccountStoreUnavailableError,
  type CreditAvailability,
} from "../../../accounts/server/accountStore";
import type { Locale } from "../../../lib/i18n";
import type {
  BillingPlanKey,
  WhopBillingStatus,
} from "../../../lib/whop/contracts";
import {
  createWhopCheckout,
  type WhopWebhookEvent,
} from "../../../lib/whop/server";
import {
  attachQuestionExternalApiEvidence,
  questionLookupPlan,
} from "../../domain/questionLookupPlan";
import { buildResearchComparison } from "../../domain/researchComparison";
import type { ResearchDispatchQueue } from "../../ports/researchQueue";
import { ensureLocalAuth, rotateLocalAuth } from "../http/localAuth";
import { enforceRequestPolicy } from "../http/requestPolicy";
import { createResearchAuth, type ResearchAuth } from "../http/researchAuth";
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
  /** Billing is mandatory for the live API; tests and fixture APIs may omit it. */
  readonly billingRequired?: boolean;
  readonly now?: () => string;
  readonly createId?: () => string;
  readonly accountStore?: AccountStore;
  readonly researchQueue?: ResearchDispatchQueue;
  readonly cognito?: {
    readonly userPoolId: string;
    readonly clientId: string;
    readonly secureCookie: boolean;
  };
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
  readonly researchRoomAccess: (request: Request) => Promise<{
    readonly authenticated: boolean;
    readonly tier: "free" | "paid";
  }>;
  readonly consumeResearchRoomCredit: (
    request: Request,
    reportId: string,
  ) => Promise<CreditAvailability & { readonly authenticated: boolean }>;
  readonly billingStatus: (request: Request) => Promise<WhopBillingStatus>;
  readonly billingCheckout: (
    request: Request,
    planKey: BillingPlanKey,
  ) => Promise<Response>;
  readonly handleWhopWebhook: (event: WhopWebhookEvent) => Promise<void>;
  readonly preferredLocale: (request: Request) => Promise<{
    readonly authenticated: boolean;
    readonly locale?: Locale;
  }>;
  readonly updatePreferredLocale: (
    request: Request,
    locale: Locale,
  ) => Promise<{ readonly authenticated: boolean; readonly stored: boolean }>;
  readonly handle: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

type ApiContext = {
  readonly options: CreateResearchApiOptions;
  readonly repository: ResearchApiRepository;
  readonly commands: ResearchCommandRepository;
  readonly runEvents: RunEventsSse;
  readonly auth: ResearchAuth;
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

function emptyBillingStatus(authenticated: boolean) {
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    authenticated,
    tier: "free" as const,
    status: "none" as const,
    credits: {
      remaining: 0,
      allowance: 0,
      used: 0,
      usedPercent: 0,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
    recentActivity: [],
  };
}

function localAccountOrigin(request: Request): URL | undefined {
  const configured = process.env.STOCKSEMBLY_ACCOUNT_ORIGIN;
  if (configured === undefined || configured.trim() === "") return undefined;
  try {
    const origin = new URL(configured);
    const current = new URL(request.url);
    if (
      origin.origin === current.origin ||
      (origin.protocol !== "http:" && origin.protocol !== "https:")
    )
      return undefined;
    return origin;
  } catch {
    return undefined;
  }
}

async function proxyAuthenticatedGet(
  request: Request,
  pathname: string,
  options?: {
    readonly accept?: string;
  },
): Promise<Response | undefined> {
  const origin = localAccountOrigin(request);
  if (origin === undefined) return undefined;
  const target = new URL(pathname, origin);
  const headers = new Headers();
  for (const name of [
    "authorization",
    "cookie",
    "x-stocksembly-identity-token",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (options?.accept !== undefined) headers.set("accept", options.accept);
  return await fetch(target, {
    method: "GET",
    headers,
    cache: "no-store",
  });
}

async function listRuns(
  context: ApiContext,
  request: Request,
  principal: string,
): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit") ?? "20";
  const limit = Number.parseInt(limitRaw, 10);
  if (!/^\d+$/.test(limitRaw) || limit < 1 || limit > 50)
    return apiError(400, "CURSOR_INVALID");
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = decodeRunCursor(cursorRaw);
  if (cursorRaw !== null && cursor === undefined)
    return apiError(400, "CURSOR_INVALID");
  if (context.options.accountStore === undefined) {
    const remote = await proxyAuthenticatedGet(
      request,
      `${url.pathname}${url.search}`,
    );
    if (remote?.ok) return remote;
  }
  const localValues = context.repository.listRuns(principal, limit + 1, cursor);
  const storedValues =
    (await context.options.accountStore?.listResearchRuns?.(
      principal,
      limit + 1,
      cursor,
    )) ?? [];
  const values = [...localValues, ...storedValues]
    .filter(
      (run, index, all) =>
        all.findIndex((candidate) => candidate.runId === run.runId) === index,
    )
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.runId.localeCompare(left.runId),
    )
    .slice(0, limit + 1);
  const runs = values.slice(0, limit);
  await Promise.all(
    runs.map(async (run) => {
      await context.options.accountStore?.recordResearchRun(principal, run);
    }),
  );
  const last = runs.at(-1);
  return apiJson({
    runs,
    ...(values.length <= limit || last === undefined
      ? {}
      : { nextCursor: encodeRunCursor(last) }),
  });
}

async function questionHistory(
  context: ApiContext,
  principal: string,
  reportId: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(reportId).success)
    return apiError(404, "NOT_FOUND");
  if (context.repository.report(principal, reportId) === undefined)
    return apiError(404, "NOT_FOUND");
  const localQuestions = context.commands.questions(principal, reportId);
  await Promise.all(
    localQuestions.map(async (question) => {
      await context.options.accountStore?.recordConsultation?.(
        principal,
        question,
      );
    }),
  );
  const storedQuestions =
    (await context.options.accountStore?.listConsultations?.(
      principal,
      reportId,
    )) ?? [];
  const questions = [...localQuestions, ...storedQuestions]
    .filter(
      (question, index, all) =>
        all.findIndex(
          (candidate) => candidate.questionId === question.questionId,
        ) === index,
    )
    .sort(
      (left, right) =>
        left.attemptOrdinal - right.attemptOrdinal ||
        left.createdAt.localeCompare(right.createdAt),
    );
  return apiJson({ questions });
}

async function runDetail(
  context: ApiContext,
  principal: string,
  runId: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(runId).success) return apiError(404, "NOT_FOUND");
  const detail = context.repository.detail(principal, runId);
  if (detail !== undefined) {
    await context.options.accountStore?.recordResearchRun(
      principal,
      detail.run,
    );
  }
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
  const run = context.repository.findRun(principal, report.runId);
  if (run !== undefined) {
    await context.options.accountStore?.recordResearchRun(principal, run);
  }
  await context.options.accountStore?.recordReportOwnership(principal, report);
  if (context.options.loadReport === undefined)
    return apiJson({ report: report.payload });
  const loaded = await context.options.loadReport(report);
  if (loaded === undefined) return apiError(404, "NOT_FOUND");
  const previousPublication = context.repository.previousComparableReport(
    principal,
    reportId,
  );
  if (previousPublication === undefined) return apiJson({ report: loaded });
  const previous = await context.options.loadReport(previousPublication);
  return previous === undefined
    ? apiJson({ report: loaded })
    : loaded.schemaVersion !== "workflow-v1" ||
        previous.schemaVersion !== "workflow-v1"
      ? apiJson({ report: loaded })
      : apiJson({
          report: loaded,
          comparison: buildResearchComparison({
            current: loaded,
            previous,
            currentPublishedAt: report.publishedAt,
            previousPublishedAt: previousPublication.publishedAt,
          }),
        });
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
    beforeQuestion: async () => {
      if (
        context.options.billingRequired === true &&
        context.options.accountStore?.checkChatCredits === undefined
      )
        throw new AccountStoreUnavailableError(
          "ACCOUNT_STORE_REQUIRED_FOR_CHAT",
        );
      const available =
        await context.options.accountStore?.checkChatCredits?.(principal);
      return available?.allowed ?? true;
    },
    onQuestion: async (question) => {
      await context.options.accountStore?.recordConsultation?.(
        principal,
        question,
      );
    },
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
  const reportQuestions = path.match(
    /^\/api\/research\/reports\/([^/]+)\/questions$/,
  )?.[1];
  if (reportQuestions !== undefined && request.method === "GET")
    return await questionHistory(context, principal, reportQuestions);
  if (path === "/api/research/runs") {
    if (request.method === "GET")
      return await listRuns(context, request, principal);
    if (request.method === "POST")
      return await createRun(context, request, principal);
    return apiError(405, "METHOD_NOT_ALLOWED");
  }
  const run = path.match(/^\/api\/research\/runs\/([^/]+)$/)?.[1];
  if (run !== undefined && request.method === "GET")
    return await runDetail(context, principal, run);
  const runEvents = path.match(/^\/api\/research\/runs\/([^/]+)\/events$/)?.[1];
  if (runEvents !== undefined && request.method === "GET")
    return context.runEvents.response(
      request,
      principal,
      runEvents,
      async () => {
        const detail = context.repository.detail(principal, runEvents);
        if (detail === undefined) return;
        try {
          await context.options.accountStore?.recordResearchRun(
            principal,
            detail.run,
          );
        } catch {
          // The next run-detail or billing read retries the idempotent record.
        }
      },
    );
  const report = path.match(/^\/api\/research\/reports\/([^/]+)$/)?.[1];
  if (report !== undefined && request.method === "GET")
    return await reportDetail(context, principal, report);
  return apiError(404, "NOT_FOUND");
}

export async function createResearchApi(
  options: CreateResearchApiOptions,
): Promise<ResearchApi> {
  const localAuth = await ensureLocalAuth(options.dataRoot);
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
    auth: createResearchAuth(
      localAuth,
      options.cognito,
      async () => await rotateLocalAuth(options.dataRoot),
    ),
  };
  return {
    get automationTokenPath() {
      return context.auth.automationTokenPath;
    },
    bootstrapSession: context.auth.bootstrapSession,
    async bootstrapSessionResponse(request) {
      const policy = await enforceRequestPolicy(request, {
        mutation: mutationFor(request),
        allowedHost: options.allowedHost,
        allowedOrigin: options.allowedOrigin,
      });
      if (policy.kind === "rejected") return policyError(policy.status);
      return await context.auth.bootstrapSessionResponse(request);
    },
    async rotateIdentity() {
      await context.auth.rotateIdentity();
    },
    async researchRoomAccess(request) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false, tier: "free" };
      if (options.accountStore === undefined)
        return { authenticated: true, tier: "free" };
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        return {
          authenticated: true,
          tier:
            (await options.accountStore.researchRoomAccess?.(
              authentication.principal.id,
            )) ?? "free",
        };
      } catch {
        return { authenticated: true, tier: "free" };
      }
    },
    async consumeResearchRoomCredit(request, reportId) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return {
          authenticated: false,
          allowed: true,
          remaining: 0,
          required: 0,
        };
      if (options.accountStore?.consumeResearchRoomCredit === undefined)
        return {
          authenticated: true,
          allowed: options.billingRequired !== true,
          remaining: 0,
          required: options.billingRequired === true ? 3 : 0,
        };
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        return {
          authenticated: true,
          ...(await options.accountStore.consumeResearchRoomCredit(
            authentication.principal.id,
            `research-room:${authentication.principal.id}:${reportId}:${randomUUID()}`,
            reportId,
          )),
        };
      } catch {
        return {
          authenticated: true,
          allowed: false,
          remaining: 0,
          required: 3,
        };
      }
    },
    async billingStatus(request) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return emptyBillingStatus(false);
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedGet(
          request,
          "/api/billing/status",
        );
        if (remote?.ok === true)
          return (await remote.json()) as WhopBillingStatus;
      }
      if (
        options.billingRequired === true &&
        options.accountStore?.billingStatus === undefined
      )
        throw new AccountStoreUnavailableError(
          "ACCOUNT_STORE_REQUIRED_FOR_BILLING",
        );
      if (options.accountStore === undefined) return emptyBillingStatus(true);
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        const status = await options.accountStore.billingStatus?.(
          authentication.principal.id,
        );
        return status === undefined
          ? emptyBillingStatus(true)
          : { authenticated: true, ...status };
      } catch {
        return emptyBillingStatus(true);
      }
    },
    async billingCheckout(request, planKey) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedGet(
          request,
          `/api/billing/checkout?plan=${encodeURIComponent(planKey)}`,
          { accept: "application/json" },
        );
        if (remote?.ok === true) {
          const payload: unknown = await remote.json();
          if (
            typeof payload === "object" &&
            payload !== null &&
            "purchaseUrl" in payload &&
            typeof payload.purchaseUrl === "string"
          )
            return apiJson({ purchaseUrl: payload.purchaseUrl });
        }
        return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
      }
      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      const configuredOrigin = process.env.STOCKSEMBLY_PUBLIC_ORIGIN;
      const origin = configuredOrigin ?? new URL(request.url).origin;
      const checkout = await createWhopCheckout({
        planKey,
        principalId: authentication.principal.id,
        returnUrl: `${origin.replace(/\/$/u, "")}/?billing=success`,
        idempotencyKey: `stocksembly:${authentication.principal.id}:${planKey}:${randomUUID()}`,
      });
      if (request.headers.get("accept")?.includes("application/json"))
        return apiJson({ purchaseUrl: checkout.purchaseUrl });
      return Response.redirect(checkout.purchaseUrl, 303);
    },
    async handleWhopWebhook(event) {
      if (
        options.billingRequired === true &&
        options.accountStore?.handleWhopWebhook === undefined
      )
        throw new AccountStoreUnavailableError(
          "ACCOUNT_STORE_REQUIRED_FOR_WEBHOOK",
        );
      await options.accountStore?.handleWhopWebhook?.(event);
    },
    async preferredLocale(request) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false };
      if (options.accountStore === undefined) return { authenticated: true };
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        const locale = await options.accountStore.preferredLocale?.(
          authentication.principal.id,
        );
        return locale === undefined
          ? { authenticated: true }
          : { authenticated: true, locale };
      } catch {
        return { authenticated: true };
      }
    },
    async updatePreferredLocale(request, locale) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false, stored: false };
      if (options.accountStore === undefined)
        return { authenticated: true, stored: false };
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        if (options.accountStore.updatePreferredLocale === undefined)
          return { authenticated: true, stored: false };
        await options.accountStore.updatePreferredLocale(
          authentication.principal.id,
          locale,
        );
        return { authenticated: true, stored: true };
      } catch {
        return { authenticated: true, stored: false };
      }
    },
    async handle(request) {
      const policy = await enforceRequestPolicy(request, {
        mutation: mutationFor(request),
        allowedHost: options.allowedHost,
        allowedOrigin: options.allowedOrigin,
      });
      if (policy.kind === "rejected") return policyError(policy.status);
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      try {
        await options.accountStore?.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
      } catch {
        return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
      }
      try {
        return await dispatch(context, request, authentication.principal.id);
      } catch (error) {
        if (error instanceof AccountStoreUnavailableError) {
          return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
        }
        throw error;
      }
    },
    close: () => {
      context.runEvents.close();
      context.commands.close();
      context.repository.close();
      options.researchQueue?.close();
      return options.accountStore?.close() ?? Promise.resolve();
    },
  };
}
