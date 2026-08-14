function exactTrue(value: string | undefined): boolean {
  return value === "true";
}

export function adminAnalyticsReadsEnabled(): boolean {
  return exactTrue(process.env["STOCKSEMBLY_ADMIN_ANALYTICS_READS_ENABLED"]);
}

export function adminAnalyticsWritesEnabled(): boolean {
  return exactTrue(process.env["STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED"]);
}
