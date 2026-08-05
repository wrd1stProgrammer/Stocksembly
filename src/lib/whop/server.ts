import Whop from "@whop/sdk";
import { z } from "zod";
import type { BillingPlanKey, BillingTier, WhopPricingPlan } from "./contracts";

export type { BillingPlanKey, WhopPricingPlan } from "./contracts";

export const FREE_DAILY_CREDIT_ALLOWANCE = 3;
export const FREE_SIGNUP_CREDIT_ALLOWANCE = 5;
export const FREE_MONTHLY_CREDIT_CAP = 30;

export const MONTHLY_CREDIT_ALLOWANCE: Readonly<Record<BillingTier, number>> = {
  free: 0,
  pro: 100,
  ultra: 300,
};

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
    tier: "Pro",
    amount: 19,
    interval: "month",
    billingPeriod: 30,
  },
  {
    key: "pro-annual",
    envKey: "WHOP_PLAN_PRO_ANNUAL_ID",
    tier: "Pro",
    amount: 190,
    interval: "year",
    billingPeriod: 365,
  },
  {
    key: "ultra-monthly",
    envKey: "WHOP_PLAN_ULTRA_MONTHLY_ID",
    tier: "Ultra",
    amount: 39,
    interval: "month",
    billingPeriod: 30,
  },
  {
    key: "ultra-annual",
    envKey: "WHOP_PLAN_ULTRA_ANNUAL_ID",
    tier: "Ultra",
    amount: 390,
    interval: "year",
    billingPeriod: 365,
  },
] as const;

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

export function billingPlanKeyForWhopPlanId(
  planId: string | undefined,
): BillingPlanKey | undefined {
  if (planId === undefined) return undefined;
  for (const definition of planDefinitions) {
    if (env(definition.envKey) === planId) return definition.key;
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

export async function createWhopCheckout(input: {
  readonly planKey: BillingPlanKey;
  readonly principalId: string;
  readonly returnUrl: string;
  readonly idempotencyKey: string;
}): Promise<WhopCheckout> {
  const configuration = whopConfiguration();
  const plan = (await getWhopPricing()).find(
    (candidate) => candidate.key === input.planKey,
  );
  if (plan === undefined) throw new Error("WHOP_PLAN_NOT_FOUND");
  const checkout = await whopClient(
    configuration,
  ).checkoutConfigurations.create({
    account_id: configuration.companyId,
    mode: "payment",
    plan_id: plan.planId,
    metadata: {
      stocksembly_principal_id: input.principalId,
      stocksembly_plan_key: input.planKey,
    },
    redirect_url: input.returnUrl,
    "Idempotency-Key": input.idempotencyKey,
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

export type WhopWebhookEvent = {
  readonly id?: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly data: unknown;
};

export function unwrapWhopWebhook(
  body: string,
  headers: Record<string, string>,
): WhopWebhookEvent {
  const secret = env("WHOP_WEBHOOK_SECRET");
  if (secret === undefined) throw new Error("WHOP_WEBHOOK_SECRET_REQUIRED");
  const configuration = whopConfiguration();
  const event = whopClient({
    ...configuration,
  });
  const unwrapped = event.webhooks.unwrap(body, {
    headers,
    key: Buffer.from(secret, "utf8").toString("base64"),
  }) as WhopWebhookEvent;
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
