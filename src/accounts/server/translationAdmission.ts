import type { PoolClient } from "pg";

export type TranslationAdmission = (client: PoolClient) => Promise<{
  readonly jobKey: string;
  readonly status: "queued" | "running" | "succeeded";
}>;
