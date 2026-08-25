import Whop from "@whop/sdk";
import { z } from "zod";
import type {
  BillingPlanKey,
  BillingStatus,
  BillingTier,
  WhopPricingPlan,
} from "./contracts";

export type { BillingPlanKey, WhopPricingPlan } from "./contracts";
export { MONTHLY_CREDIT_ALLOWANCE } from "./creditPolicy";

export const FREE_DAILY_CREDIT_ALLOWANCE = 3;
export const FREE_SIGNUP_CREDIT_ALLOWANCE = 5;
export const FREE_MONTHLY_CREDIT_CAP = 30;

const WhopPlanSchema = z.object({
  id: z.string().startsWith("plan_"),
  product: z
    .object({ id: z.string().startsWith("prod_") })
    .nullable()
    .optional(),
  currency: z.string(),
  initial_price: z.number(),
  renewal_price: z.number(),
  billing_period: z.number().int().positive(),
  purchase_url: z.string().url(),
});

const WhopPlanListSchema = z.object({ data: z.array(WhopPlanSchema) });

const planDefinitions = [
  {
    key: "pro-monthly",
    envKey: "WHOP_PLAN_PRO_MONTHLY_ID",
    sandboxEnvKey: "WHOP_SANDBOX_PLAN_PRO_MONTHLY_ID",
    tier: "Pro",
    amount: 19,
    interval: "month",
    billingPeriod: 30,
  },
  {
    key: "pro-annual",
    envKey: "WHOP_PLAN_PRO_ANNUAL_ID",
    sandboxEnvKey: "WHOP_SANDBOX_PLAN_PRO_ANNUAL_ID",
    tier: "Pro",
    amount: 190,
    interval: "year",
    billingPeriod: 365,
  },
  {
    key: "ultra-monthly",
    envKey: "WHOP_PLAN_ULTRA_MONTHLY_ID",
    sandboxEnvKey: "WHOP_SANDBOX_PLAN_ULTRA_MONTHLY_ID",
    tier: "Ultra",
    amount: 39,
    interval: "month",
    billingPeriod: 30,
  },
  {
    key: "ultra-annual",
    envKey: "WHOP_PLAN_ULTRA_ANNUAL_ID",
    sandboxEnvKey: "WHOP_SANDBOX_PLAN_ULTRA_ANNUAL_ID",
    tier: "Ultra",
    amount: 390,
    interval: "year",
    billingPeriod: 365,
  },
] as const;

const PRO_MONTHLY_LIVE_TEST_PLAN_ENV_KEY = "WHOP_PLAN_PRO_MONTHLY_LIVE_TEST_ID";
const PRO_MONTHLY_LIVE_TEST_AMOUNT = 1;
const PRO_MONTHLY_LIVE_TEST_BILLING_PERIOD = 30;

export function isWhopProMonthlyLiveTestPlan(plan: {
  readonly renewal_price: number;
  readonly billing_period: number;
}): boolean {
  return (
    plan.renewal_price === PRO_MONTHLY_LIVE_TEST_AMOUNT &&
    plan.billing_period === PRO_MONTHLY_LIVE_TEST_BILLING_PERIOD
  );
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

export function getWhopEnvironment(): "sandbox" | "production" {
  return env("WHOP_SANDBOX") === "true" ? "sandbox" : "production";
}

export function getWhopProductId(): string {
  const productId = env("WHOP_PRODUCT_ID");
  if (productId === undefined) throw new Error("WHOP_PRODUCT_ID_REQUIRED");
  return productId;
}

function whopConfiguration() {
  const apiKey = env("WHOP_API_KEY");
  const companyId = env("WHOP_COMPANY_ID");
  const productId = getWhopProductId();
  const defaultApiBase =
    getWhopEnvironment() === "sandbox"
      ? "https://sandbox-api.whop.com/api/v1"
      : "https://api.whop.com/api/v1";
  const apiBase = (env("WHOP_API_BASE") ?? defaultApiBase).replace(/\/$/u, "");
  if (apiKey === undefined) throw new Error("WHOP_API_KEY_REQUIRED");
  if (companyId === undefined) throw new Error("WHOP_COMPANY_ID_REQUIRED");
  return { apiBase, apiKey, companyId, productId } as const;
}

function whopClient(configuration: ReturnType<typeof whopConfiguration>): Whop {
  return new Whop({
    apiKey: configuration.apiKey,
    baseURL: configuration.apiBase,
  });
}

export function billingTierForPlanKey(
  key: BillingPlanKey,
): Exclude<BillingTier, "free"> {
  return key.startsWith("pro-") ? "pro" : "ultra";
}

export type SubscriptionCheckoutDecision =
  | { readonly kind: "checkout" }
  | { readonly kind: "manage"; readonly purchaseUrl: string }
  | { readonly kind: "blocked" };

export type SubscriptionCheckoutState = {
  readonly tier: BillingTier;
  readonly status: BillingStatus;
  readonly manageUrl?: string | undefined;
};

export function subscriptionCheckoutDecision(
  status: SubscriptionCheckoutState,
): SubscriptionCheckoutDecision {
  const hasPaidMembership =
    status.tier !== "free" &&
    (status.status === "active" ||
      status.status === "trialing" ||
      status.status === "past_due");
  if (!hasPaidMembership) return { kind: "checkout" };
  return status.manageUrl === undefined
    ? { kind: "blocked" }
    : { kind: "manage", purchaseUrl: status.manageUrl };
}

export function billingPlanKeyForWhopPlanId(
  planId: string | undefined,
): BillingPlanKey | undefined {
  if (planId === undefined) return undefined;
  if (env(PRO_MONTHLY_LIVE_TEST_PLAN_ENV_KEY) === planId) return "pro-monthly";
  for (const definition of planDefinitions) {
    if (
      env(definition.envKey) === planId ||
      env(definition.sandboxEnvKey) === planId
    )
      return definition.key;
  }
  return undefined;
}

export function billingPlanKeyForPrice(
  amount: number | undefined,
  billingPeriod: number | undefined,
): BillingPlanKey | undefined {
  if (amount === undefined || billingPeriod === undefined) return undefined;
  return planDefinitions.find(
    (definition) =>
      definition.amount === amount &&
      definition.billingPeriod === billingPeriod,
  )?.key;
}

export type WhopCheckout = {
  readonly checkoutConfigurationId?: string;
  readonly planId: string;
  readonly purchaseUrl: string;
};

function createCheckoutConfiguration(input: {
  readonly configuration: ReturnType<typeof whopConfiguration>;
  readonly planId: string;
  readonly planKey: BillingPlanKey;
  readonly principalId: string;
  readonly returnUrl: string;
  readonly idempotencyKey: string;
  readonly checkoutAttemptId?: string;
  readonly liveTest?: boolean;
}) {
  return whopClient(input.configuration).checkoutConfigurations.create({
    account_id: input.configuration.companyId,
    mode: "payment",
    plan_id: input.planId,
    metadata: {
      stocksembly_principal_id: input.principalId,
      stocksembly_plan_key: input.planKey,
      ...(input.liveTest === true
        ? { stocksembly_billing_test: "live-dollar" }
        : {}),
      ...(input.checkoutAttemptId === undefined
        ? {}
        : { stocksembly_checkout_attempt_id: input.checkoutAttemptId }),
    },
    redirect_url: input.returnUrl,
    "Idempotency-Key": input.idempotencyKey,
  });
}

export async function createWhopCheckout(input: {
  readonly planKey: BillingPlanKey;
  readonly principalId: string;
  readonly returnUrl: string;
  readonly idempotencyKey: string;
  readonly checkoutAttemptId?: string;
}): Promise<WhopCheckout> {
  const configuration = whopConfiguration();
  const plan = (await getWhopPricing()).find(
    (candidate) => candidate.key === input.planKey,
  );
  if (plan === undefined) throw new Error("WHOP_PLAN_NOT_FOUND");
  const checkout = await createCheckoutConfiguration({
    configuration,
    planId: plan.planId,
    planKey: input.planKey,
    principalId: input.principalId,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
    ...(input.checkoutAttemptId === undefined
      ? {}
      : { checkoutAttemptId: input.checkoutAttemptId }),
  });
  const purchaseUrl = checkout.purchase_url ?? plan.purchaseUrl;
  return {
    ...(checkout.id === undefined
      ? {}
      : { checkoutConfigurationId: checkout.id }),
    planId: plan.planId,
    purchaseUrl,
  };
}

export async function createWhopProMonthlyLiveTestCheckout(input: {
  readonly principalId: string;
  readonly returnUrl: string;
  readonly idempotencyKey: string;
  readonly checkoutAttemptId?: string;
}): Promise<WhopCheckout> {
  if (getWhopEnvironment() !== "production")
    throw new Error("WHOP_LIVE_TEST_PRODUCTION_ONLY");
  const planId = env(PRO_MONTHLY_LIVE_TEST_PLAN_ENV_KEY);
  if (planId === undefined) throw new Error("WHOP_LIVE_TEST_PLAN_REQUIRED");
  const plan = (await listWhopPlans()).find(
    (candidate) => candidate.id === planId,
  );
  if (plan === undefined) throw new Error("WHOP_LIVE_TEST_PLAN_NOT_FOUND");
  if (!isWhopProMonthlyLiveTestPlan(plan))
    throw new Error("WHOP_LIVE_TEST_PLAN_INVALID");

  const configuration = whopConfiguration();
  const checkout = await createCheckoutConfiguration({
    configuration,
    planId: plan.id,
    planKey: "pro-monthly",
    principalId: input.principalId,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
    liveTest: true,
    ...(input.checkoutAttemptId === undefined
      ? {}
      : { checkoutAttemptId: input.checkoutAttemptId }),
  });
  return {
    ...(checkout.id === undefined
      ? {}
      : { checkoutConfigurationId: checkout.id }),
    planId: plan.id,
    purchaseUrl: checkout.purchase_url ?? plan.purchase_url,
  };
}

export type WhopWebhookEvent = {
  readonly id?: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly data: unknown;
  readonly sourceEnvironment?: "sandbox" | "production";
};

export function unwrapWhopWebhook(
  body: string,
  headers: Record<string, string>,
): WhopWebhookEvent {
  const primarySecret = env("WHOP_WEBHOOK_SECRET");
  const sandboxSecret = env("WHOP_SANDBOX_WEBHOOK_SECRET");
  const secrets = [primarySecret, sandboxSecret].filter(
    (secret, index, candidates): secret is string =>
      secret !== undefined && candidates.indexOf(secret) === index,
  );
  if (primarySecret === undefined)
    throw new Error("WHOP_WEBHOOK_SECRET_REQUIRED");
  const configuration = whopConfiguration();
  const client = whopClient({
    ...configuration,
  });
  let unwrapped: WhopWebhookEvent | undefined;
  let sourceEnvironment = getWhopEnvironment();
  let verificationError: unknown;
  for (const secret of secrets) {
    try {
      unwrapped = client.webhooks.unwrap(body, {
        headers,
        key: Buffer.from(secret, "utf8").toString("base64"),
      }) as WhopWebhookEvent;
      if (secret === sandboxSecret && secret !== primarySecret)
        sourceEnvironment = "sandbox";
      break;
    } catch (error) {
      verificationError = error;
    }
  }
  if (unwrapped === undefined) throw verificationError;
  if (
    unwrapped === null ||
    typeof unwrapped !== "object" ||
    typeof unwrapped.type !== "string" ||
    !("data" in unwrapped)
  ) {
    throw new Error("WHOP_WEBHOOK_PAYLOAD_INVALID");
  }
  return {
    ...unwrapped,
    sourceEnvironment,
    ...(unwrapped.id === undefined && headers["webhook-id"] !== undefined
      ? { id: headers["webhook-id"] }
      : {}),
  };
}

export async function listWhopPlans() {
  const configuration = whopConfiguration();
  const query = new URLSearchParams({
    company_id: configuration.companyId,
    first: "100",
  });
  const response = await fetch(`${configuration.apiBase}/plans?${query}`, {
    headers: { Authorization: `Bearer ${configuration.apiKey}` },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`WHOP_PLANS_REQUEST_FAILED_${response.status}`);
  const payload = WhopPlanListSchema.parse(await response.json());
  return payload.data.filter(
    (plan) => plan.product?.id === configuration.productId,
  );
}

export async function getWhopPricing(): Promise<readonly WhopPricingPlan[]> {
  const plans = await listWhopPlans();
  return planDefinitions.map((definition) => {
    const configuredId = env(definition.envKey);
    const plan =
      (configuredId === undefined
        ? undefined
        : plans.find((candidate) => candidate.id === configuredId)) ??
      plans.find(
        (candidate) =>
          candidate.renewal_price === definition.amount &&
          candidate.billing_period === definition.billingPeriod,
      );
    if (plan === undefined)
      throw new Error(`WHOP_PLAN_NOT_FOUND_${definition.key}`);
    return {
      key: definition.key,
      tier: definition.tier,
      amount: definition.amount,
      interval: definition.interval,
      planId: plan.id,
      purchaseUrl: plan.purchase_url,
    };
  });
}
