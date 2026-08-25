import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type AccountStore,
  AccountStoreUnavailableError,
  type CreditAvailability,
} from "../../../accounts/server/accountStore";
import {
  adminAnalyticsReadsEnabled,
  adminAnalyticsWritesEnabled,
} from "../../../admin/adminAnalyticsFlags";
import type {
  AcquisitionAttributionInput,
  AdminAnalyticsOverview,
  AdminAnalyticsQuery,
  AdminUserDetail,
  AdminUserList,
} from "../../../admin/analyticsContracts";
import { authorizeAdmin } from "../../../admin/server/adminAuthorization";
import type {
  BriefingEditionPayload,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "../../../briefing/domain/contracts";
import { nextUsPremarketBriefingAt } from "../../../briefing/domain/marketCalendar";
import type { AppLocale, Locale } from "../../../lib/i18n";
import type {
  BillingPlanKey,
  WhopBillingStatus,
} from "../../../lib/whop/contracts";
import { CREDIT_COSTS } from "../../../lib/whop/creditPolicy";
import {
  createWhopCheckout,
  createWhopProMonthlyLiveTestCheckout,
  getWhopEnvironment,
  type SubscriptionCheckoutState,
  subscriptionCheckoutDecision,
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
import {
  type PublicReportLoader,
  PublicRunSchema,
} from "./researchApiContracts";
import { createRun } from "./researchApiCreation";
import { decodeRunCursor, encodeRunCursor } from "./researchApiCursor";
import { ResearchApiRepository } from "./researchApiRepository";
import { apiError, apiJson } from "./researchApiResponses";
import { handleResearchCommand } from "./researchCommandHandler";
import { ResearchCommandRepository } from "./researchCommandRepository";
import { RunEventsSse } from "./runEventsSse";

const UuidSchema = z.string().uuid();
const RemoteRunListSchema = z.object({
  runs: z.array(PublicRunSchema).readonly(),
});
const SubscriptionCheckoutStateSchema = z.object({
  tier: z.enum(["free", "pro", "ultra"]),
  status: z.enum(["active", "trialing", "past_due", "cancelled", "none"]),
  manageUrl: z.string().url().optional(),
});

export type AdminAnalyticsReadResult<T> =
  | { readonly kind: "ok"; readonly data: T }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "disabled" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

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
  readonly adminBillingLiveTestCheckout: (
    request: Request,
  ) => Promise<Response>;
  readonly handleWhopWebhook: (event: WhopWebhookEvent) => Promise<void>;
  readonly adminAnalyticsOverview: (
    request: Request,
    query: AdminAnalyticsQuery,
  ) => Promise<AdminAnalyticsReadResult<AdminAnalyticsOverview>>;
  readonly adminAnalyticsUsers: (
    request: Request,
    query: AdminAnalyticsQuery,
  ) => Promise<AdminAnalyticsReadResult<AdminUserList>>;
  readonly adminAnalyticsUser: (
    request: Request,
    principalId: string,
    query: AdminAnalyticsQuery,
  ) => Promise<AdminAnalyticsReadResult<AdminUserDetail>>;
  readonly recordAcquisitionAttribution: (
    request: Request,
    attribution: AcquisitionAttributionInput,
  ) => Promise<Response>;
  readonly preferredLocale: (request: Request) => Promise<{
    readonly authenticated: boolean;
    readonly locale?: AppLocale;
  }>;
  readonly updatePreferredLocale: (
    request: Request,
    locale: AppLocale,
  ) => Promise<{ readonly authenticated: boolean; readonly stored: boolean }>;
  readonly briefingRoom: (
    request: Request,
    locale: Locale,
  ) => Promise<BriefingRoomState>;
  readonly addBriefingWatchlistItem: (
    request: Request,
    item: Omit<BriefingWatchlistItem, "position" | "createdAt">,
  ) => Promise<
    | { readonly authenticated: false }
    | {
        readonly authenticated: true;
        readonly result: "added" | "exists";
        readonly item: BriefingWatchlistItem;
      }
    | {
        readonly authenticated: true;
        readonly result: "limit";
        readonly limit: number;
      }
    | {
        readonly authenticated: true;
        readonly result: "change_limit";
        readonly remaining: 0;
      }
    | { readonly authenticated: true; readonly result: "forbidden" }
  >;
  readonly removeBriefingWatchlistItem: (
    request: Request,
    symbol: string,
  ) => Promise<{
    readonly authenticated: boolean;
    readonly removed: boolean;
    readonly changesRemaining?: number;
    readonly limitReached?: boolean;
  }>;
  readonly briefingDetail: (
    request: Request,
    briefingId: string,
  ) => Promise<{
    readonly authenticated: boolean;
    readonly briefing?: BriefingEditionPayload;
  }>;
  readonly markBriefingRead: (
    request: Request,
    briefingId: string,
  ) => Promise<{ readonly authenticated: boolean; readonly marked: boolean }>;
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
  const configured = process.env["STOCKSEMBLY_ACCOUNT_ORIGIN"];
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

function billingReturnUrl(request: Request): string {
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin =
    process.env["STOCKSEMBLY_PUBLIC_ORIGIN"] ?? requestOrigin;
  const publicOrigin = new URL(configuredOrigin);
  if (publicOrigin.protocol === "https:")
    return new URL("/?billing=success", publicOrigin).toString();

  const accountOrigin = localAccountOrigin(request);
  if (accountOrigin?.protocol !== "https:")
    throw new Error("STOCKSEMBLY_HTTPS_BILLING_RETURN_REQUIRED");
  const bridge = new URL("/api/billing/return", accountOrigin);
  bridge.searchParams.set("target", "local");
  return bridge.toString();
}

async function proxyAuthenticatedRequest(
  request: Request,
  pathname: string,
  init: { readonly method: "GET" | "POST" | "DELETE"; readonly body?: unknown },
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
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return await fetch(target, {
    method: init.method,
    headers,
    cache: "no-store",
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
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
  let remoteValues: readonly z.infer<typeof PublicRunSchema>[] = [];
  if (context.options.accountStore === undefined) {
    const remote = await proxyAuthenticatedGet(
      request,
      `${url.pathname}${url.search}`,
    );
    if (remote?.ok) {
      const parsed = RemoteRunListSchema.safeParse(
        await remote.json().catch(() => undefined),
      );
      if (parsed.success) remoteValues = parsed.data.runs;
    }
  }
  const localValues = context.repository.listRuns(principal, limit + 1, cursor);
  const storedValues =
    (await context.options.accountStore
      ?.listResearchRuns?.(principal, limit + 1, cursor)
      .catch(() => [])) ?? [];
  const values = [...localValues, ...storedValues, ...remoteValues]
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
      await context.options.accountStore
        ?.recordResearchRun(principal, run)
        .catch(() => undefined);
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
    onRetry: async (runId) => {
      const run = context.repository.findRun(principal, runId);
      if (run === undefined) return;
      const effects: Promise<unknown>[] = [];
      if (context.options.accountStore !== undefined)
        effects.push(
          context.options.accountStore.recordResearchRun(principal, run),
        );
      if (context.options.researchQueue !== undefined)
        effects.push(context.options.researchQueue.enqueue(run));
      const results = await Promise.allSettled(effects);
      for (const result of results) {
        if (result.status === "fulfilled") continue;
        process.stderr.write(
          `${JSON.stringify({
            kind: "research_retry_notification_failed",
            runId,
            errorName:
              result.reason instanceof Error ? result.reason.name : "Unknown",
          })}\n`,
        );
      }
    },
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
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedGet(
          request,
          "/api/billing/status",
        );
        if (remote?.ok === true) {
          const status = (await remote.json()) as WhopBillingStatus;
          return {
            authenticated: true,
            tier: status.tier === "free" ? "free" : "paid",
          };
        }
        return { authenticated: true, tier: "free" };
      }
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
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          `/api/research-room/${encodeURIComponent(reportId)}/credit`,
          { method: "POST" },
        );
        if (remote?.ok === true) {
          const value = (await remote.json()) as CreditAvailability & {
            readonly authenticated: boolean;
          };
          return value;
        }
        // Keep mixed-version split deployments usable while the dedicated
        // consume endpoint rolls out. The account service remains the source
        // of truth for the current balance; the idempotent debit endpoint is
        // used as soon as it is available.
        const billing = await proxyAuthenticatedGet(
          request,
          "/api/billing/status",
        );
        if (billing?.ok === true) {
          const status = (await billing.json()) as WhopBillingStatus;
          const required = CREDIT_COSTS.researchRoomView;
          return {
            authenticated: true,
            allowed: status.credits.remaining >= required,
            remaining: status.credits.remaining,
            required,
          };
        }
      }
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
            `research-room:${authentication.principal.id}:${reportId}`,
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
      } catch (error) {
        if (error instanceof AccountStoreUnavailableError) throw error;
        throw new AccountStoreUnavailableError(
          "ACCOUNT_BILLING_STATUS_FAILED",
          {
            cause: error,
          },
        );
      }
    },
    async billingCheckout(request, planKey) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      let currentBillingStatus: SubscriptionCheckoutState | undefined;
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedGet(
          request,
          "/api/billing/status",
        );
        if (remote?.ok === true) {
          const parsed = SubscriptionCheckoutStateSchema.safeParse(
            await remote.json(),
          );
          if (!parsed.success)
            return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
          currentBillingStatus = parsed.data;
        } else if (localAccountOrigin(request) !== undefined) {
          return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
        }
      } else {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        const accountBillingStatus = await options.accountStore.billingStatus?.(
          authentication.principal.id,
        );
        if (accountBillingStatus === undefined) {
          if (options.billingRequired === true)
            throw new AccountStoreUnavailableError(
              "ACCOUNT_STORE_REQUIRED_FOR_BILLING",
            );
        } else {
          currentBillingStatus = {
            tier: accountBillingStatus.tier,
            status: accountBillingStatus.status,
            ...(accountBillingStatus.manageUrl === undefined
              ? {}
              : { manageUrl: accountBillingStatus.manageUrl }),
          };
        }
      }
      if (currentBillingStatus !== undefined) {
        const decision = subscriptionCheckoutDecision(currentBillingStatus);
        switch (decision.kind) {
          case "manage":
            return request.headers.get("accept")?.includes("application/json")
              ? apiJson({ purchaseUrl: decision.purchaseUrl })
              : Response.redirect(decision.purchaseUrl, 303);
          case "blocked":
            return apiError(409, "BILLING_MANAGE_URL_REQUIRED");
          case "checkout":
            break;
          default:
            decision satisfies never;
        }
      }
      const checkoutAttemptId = randomUUID();
      const returnUrl = billingReturnUrl(request);
      await options.accountStore?.createCheckoutAttempt?.(
        authentication.principal.id,
        planKey,
        checkoutAttemptId,
      );
      let checkout: Awaited<ReturnType<typeof createWhopCheckout>>;
      try {
        checkout = await createWhopCheckout({
          planKey,
          principalId: authentication.principal.id,
          returnUrl,
          idempotencyKey: `stocksembly:checkout:${checkoutAttemptId}`,
          checkoutAttemptId,
        });
        await options.accountStore?.markCheckoutAttemptReady?.(
          checkoutAttemptId,
          checkout.checkoutConfigurationId,
        );
      } catch (error) {
        await options.accountStore?.markCheckoutAttemptFailed?.(
          checkoutAttemptId,
        );
        throw error;
      }
      if (request.headers.get("accept")?.includes("application/json"))
        return apiJson({
          purchaseUrl: checkout.purchaseUrl,
          planId: checkout.planId,
          ...(checkout.checkoutConfigurationId === undefined
            ? {}
            : { sessionId: checkout.checkoutConfigurationId }),
          returnUrl,
          environment: getWhopEnvironment(),
        });
      return Response.redirect(checkout.purchaseUrl, 303);
    },
    async adminBillingLiveTestCheckout(request) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      const authorization = authorizeAdmin(authentication);
      if (authorization.kind !== "authorized")
        return apiError(403, "REQUEST_FORBIDDEN");
      if (
        options.accountStore?.billingStatus === undefined ||
        options.accountStore.createCheckoutAttempt === undefined
      )
        throw new AccountStoreUnavailableError(
          "ACCOUNT_STORE_REQUIRED_FOR_BILLING",
        );

      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      const currentBillingStatus = await options.accountStore.billingStatus(
        authentication.principal.id,
      );
      if (
        subscriptionCheckoutDecision(currentBillingStatus).kind !== "checkout"
      )
        return apiError(409, "BILLING_MANAGE_URL_REQUIRED");

      const checkoutAttemptId = randomUUID();
      await options.accountStore.createCheckoutAttempt(
        authentication.principal.id,
        "pro-monthly",
        checkoutAttemptId,
      );
      try {
        const checkout = await createWhopProMonthlyLiveTestCheckout({
          principalId: authentication.principal.id,
          returnUrl: billingReturnUrl(request),
          idempotencyKey: `stocksembly:live-test-checkout:${checkoutAttemptId}`,
          checkoutAttemptId,
        });
        await options.accountStore.markCheckoutAttemptReady?.(
          checkoutAttemptId,
          checkout.checkoutConfigurationId,
        );
        if (request.headers.get("accept")?.includes("application/json"))
          return apiJson({ purchaseUrl: checkout.purchaseUrl });
        return Response.redirect(checkout.purchaseUrl, 303);
      } catch (error) {
        await options.accountStore.markCheckoutAttemptFailed?.(
          checkoutAttemptId,
        );
        throw error;
      }
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
    async adminAnalyticsOverview(request, query) {
      if (!adminAnalyticsReadsEnabled()) return { kind: "disabled" };
      const authorization = authorizeAdmin(
        await context.auth.authenticate(request),
      );
      if (authorization.kind !== "authorized") return authorization;
      if (options.accountStore?.adminAnalyticsOverview === undefined)
        return { kind: "unavailable" };
      try {
        return {
          kind: "ok",
          data: await options.accountStore.adminAnalyticsOverview(query),
        };
      } catch {
        return { kind: "unavailable" };
      }
    },
    async adminAnalyticsUsers(request, query) {
      if (!adminAnalyticsReadsEnabled()) return { kind: "disabled" };
      const authorization = authorizeAdmin(
        await context.auth.authenticate(request),
      );
      if (authorization.kind !== "authorized") return authorization;
      if (options.accountStore?.adminAnalyticsUsers === undefined)
        return { kind: "unavailable" };
      try {
        return {
          kind: "ok",
          data: await options.accountStore.adminAnalyticsUsers(query),
        };
      } catch {
        return { kind: "unavailable" };
      }
    },
    async adminAnalyticsUser(request, principalId, query) {
      if (!adminAnalyticsReadsEnabled()) return { kind: "disabled" };
      const authorization = authorizeAdmin(
        await context.auth.authenticate(request),
      );
      if (authorization.kind !== "authorized") return authorization;
      if (options.accountStore?.adminAnalyticsUser === undefined)
        return { kind: "unavailable" };
      try {
        const data = await options.accountStore.adminAnalyticsUser(
          principalId,
          query,
        );
        return data === undefined
          ? { kind: "not_found" }
          : { kind: "ok", data };
      } catch {
        return { kind: "unavailable" };
      }
    },
    async recordAcquisitionAttribution(request, attribution) {
      if (!adminAnalyticsWritesEnabled()) return apiError(404, "NOT_FOUND");
      const policy = await enforceRequestPolicy(request, {
        mutation: true,
        allowedHost: options.allowedHost,
        allowedOrigin: options.allowedOrigin,
      });
      if (policy.kind === "rejected") return policyError(policy.status);
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return apiError(401, "AUTHENTICATION_REQUIRED");
      if (options.accountStore?.recordAcquisitionAttribution === undefined)
        return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        const result = await options.accountStore.recordAcquisitionAttribution(
          authentication.principal.id,
          attribution,
        );
        return apiJson({ stored: result === "stored" });
      } catch {
        return apiError(503, "ACCOUNT_STORE_UNAVAILABLE");
      }
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
    async briefingRoom(request, locale) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return {
          authenticated: false,
          tier: "free",
          enabled: false,
          watchlistLimit: 0,
          nextBriefingAt: nextUsPremarketBriefingAt(),
          marketTimeZone: "America/New_York",
          watchlist: [],
          briefings: [],
          unreadCount: 0,
        };
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          `/api/briefings?locale=${locale}`,
          { method: "GET" },
        );
        if (remote?.ok === true)
          return (await remote.json()) as BriefingRoomState;
        const billing = await proxyAuthenticatedGet(
          request,
          "/api/billing/status",
        );
        if (billing?.ok === true) {
          const status = (await billing.json()) as WhopBillingStatus;
          const enabled =
            (status.tier === "pro" || status.tier === "ultra") &&
            (status.status === "active" || status.status === "trialing");
          return {
            authenticated: true,
            tier: status.tier,
            enabled,
            watchlistLimit:
              enabled && status.tier === "ultra" ? 10 : enabled ? 3 : 0,
            nextBriefingAt: nextUsPremarketBriefingAt(),
            marketTimeZone: "America/New_York",
            watchlist: [],
            briefings: [],
            unreadCount: 0,
          };
        }
      }
      if (
        options.accountStore?.briefingAccess === undefined ||
        options.accountStore.listBriefingWatchlist === undefined ||
        options.accountStore.listBriefings === undefined
      )
        return {
          authenticated: true,
          tier: "free",
          enabled: false,
          watchlistLimit: 0,
          nextBriefingAt: nextUsPremarketBriefingAt(),
          marketTimeZone: "America/New_York",
          watchlist: [],
          briefings: [],
          unreadCount: 0,
        };
      try {
        await options.accountStore.syncUser(
          authentication.principal,
          options.now?.() ?? new Date().toISOString(),
        );
        const [access, watchlist, briefings] = await Promise.all([
          options.accountStore.briefingAccess(authentication.principal.id),
          options.accountStore.listBriefingWatchlist(
            authentication.principal.id,
          ),
          options.accountStore.listBriefings(
            authentication.principal.id,
            locale,
            45,
          ),
        ]);
        return {
          ...access,
          nextBriefingAt: nextUsPremarketBriefingAt(),
          marketTimeZone: "America/New_York",
          watchlist,
          briefings,
          unreadCount: briefings.filter((briefing) => briefing.unread).length,
        };
      } catch {
        return {
          authenticated: true,
          tier: "free",
          enabled: false,
          watchlistLimit: 0,
          nextBriefingAt: nextUsPremarketBriefingAt(),
          marketTimeZone: "America/New_York",
          watchlist: [],
          briefings: [],
          unreadCount: 0,
        };
      }
    },
    async addBriefingWatchlistItem(request, item) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false };
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          "/api/briefings/watchlist",
          { method: "POST", body: item },
        );
        if (remote !== undefined)
          return (await remote.json()) as Awaited<
            ReturnType<ResearchApi["addBriefingWatchlistItem"]>
          >;
      }
      if (options.accountStore?.addBriefingWatchlistItem === undefined)
        return { authenticated: true, result: "forbidden" };
      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      const result = await options.accountStore.addBriefingWatchlistItem(
        authentication.principal.id,
        item,
      );
      if (result.kind === "added" || result.kind === "exists")
        return {
          authenticated: true,
          result: result.kind,
          item: result.item,
        };
      if (result.kind === "limit")
        return { authenticated: true, result: "limit", limit: result.limit };
      if (result.kind === "change_limit")
        return {
          authenticated: true,
          result: "change_limit",
          remaining: result.remaining,
        };
      return { authenticated: true, result: "forbidden" };
    },
    async removeBriefingWatchlistItem(request, symbol) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false, removed: false };
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          `/api/briefings/watchlist/${encodeURIComponent(symbol)}`,
          { method: "DELETE" },
        );
        if (remote !== undefined)
          return (await remote.json()) as Awaited<
            ReturnType<ResearchApi["removeBriefingWatchlistItem"]>
          >;
      }
      if (options.accountStore?.removeBriefingWatchlistItem === undefined)
        return { authenticated: true, removed: false };
      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      return {
        authenticated: true,
        ...(await options.accountStore.removeBriefingWatchlistItem(
          authentication.principal.id,
          symbol,
        )),
      };
    },
    async briefingDetail(request, briefingId) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false };
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          `/api/briefings/${encodeURIComponent(briefingId)}`,
          { method: "GET" },
        );
        if (remote?.ok === true)
          return (await remote.json()) as {
            readonly authenticated: boolean;
            readonly briefing?: BriefingEditionPayload;
          };
      }
      if (options.accountStore?.briefingDetail === undefined)
        return { authenticated: true };
      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      const briefing = await options.accountStore.briefingDetail(
        authentication.principal.id,
        briefingId,
      );
      return briefing === undefined
        ? { authenticated: true }
        : { authenticated: true, briefing };
    },
    async markBriefingRead(request, briefingId) {
      const authentication = await context.auth.authenticate(request);
      if (authentication.kind === "unauthorized")
        return { authenticated: false, marked: false };
      if (options.accountStore === undefined) {
        const remote = await proxyAuthenticatedRequest(
          request,
          `/api/briefings/${encodeURIComponent(briefingId)}/read`,
          { method: "POST" },
        );
        if (remote?.ok === true)
          return (await remote.json()) as {
            readonly authenticated: boolean;
            readonly marked: boolean;
          };
      }
      if (options.accountStore?.markBriefingRead === undefined)
        return { authenticated: true, marked: false };
      await options.accountStore.syncUser(
        authentication.principal,
        options.now?.() ?? new Date().toISOString(),
      );
      return {
        authenticated: true,
        marked: await options.accountStore.markBriefingRead(
          authentication.principal.id,
          briefingId,
        ),
      };
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
