import { readFile } from "node:fs/promises";
import { Pool } from "pg";

let pool;
try {
  let secretInput = "";
  for await (const chunk of process.stdin) secretInput += chunk;
  const secret = JSON.parse(secretInput);
  pool = new Pool({
    host: process.env.STOCKSEMBLY_DB_HOST ?? secret.host,
    port: Number(process.env.STOCKSEMBLY_DB_PORT ?? secret.port ?? 5432),
    user: secret.username,
    password: secret.password,
    database: process.env.STOCKSEMBLY_DB_NAME ?? secret.dbname ?? "stocksembly",
    options:
      "-c search_path=research,pg_catalog -c default_transaction_read_only=on",
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(
        process.env.STOCKSEMBLY_DB_CA_PATH ??
          "/etc/ssl/certs/aws-rds-global-bundle.pem",
        "utf8",
      ),
    },
  });
  const {
    rows: [queue],
  } = await pool.query(`
    SELECT COUNT(DISTINCT jobs.run_id) FILTER (WHERE jobs.status = 'queued')::int AS queued,
      COUNT(DISTINCT jobs.run_id) FILTER (WHERE jobs.status IN ('leased','spawn-reserved','running')
        AND jobs.lease_expires_at::timestamptz > now())::int AS active,
      COALESCE(EXTRACT(EPOCH FROM now() - MIN(jobs.created_at::timestamptz)
        FILTER (WHERE jobs.status = 'queued')), 0)::float8 AS oldest
    FROM jobs JOIN runs USING(run_id)
    WHERE runs.status IN ('queued','running') AND jobs.kind = 'research'`);
  const {
    rows: [durations],
  } = await pool.query(`
    WITH completed AS (
      SELECT runs.run_id, runs.created_at::timestamptz AS started,
        MIN(report_versions.published_at::timestamptz) AS finished
      FROM runs JOIN report_versions ON report_versions.run_id = runs.run_id
        JOIN reports ON reports.report_id = report_versions.report_id
      WHERE runs.status IN ('completed','complete-with-limitations')
        AND reports.state = 'published' AND report_versions.status IN ('complete','complete_with_limitations')
        AND report_versions.published_at::timestamptz > now() - interval '24 hours'
      GROUP BY runs.run_id, runs.created_at
    ) SELECT COUNT(*)::int AS samples,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished - started)) AS p95
      FROM completed WHERE finished >= started`);
  const {
    rows: [outcomes],
  } = await pool.query(`
    SELECT count(*)::int AS requested,
      count(*) FILTER (WHERE status='completed')::int AS completed,
      count(*) FILTER (WHERE status='complete-with-limitations')::int AS limited,
      count(*) FILTER (WHERE status IN ('failed','incomplete'))::int AS failed,
      count(*) FILTER (WHERE status='cancelled')::int AS cancelled
    FROM runs WHERE created_at::timestamptz > now()-interval '24 hours'`);
  const dimensions = [{ Name: "Service", Value: "stocksembly" }];
  const metric = (MetricName, Value, Unit = "Count") => ({
    MetricName,
    Value,
    Unit,
    Dimensions: dimensions,
  });
  const data = [
    metric("QueuedResearchRuns", queue.queued),
    metric("ActiveResearchRuns", queue.active),
    metric("OldestQueuedResearchSeconds", Math.max(0, queue.oldest), "Seconds"),
    metric("CompletedResearchSamples24h", durations.samples),
    metric("QueueMetricsHeartbeat", 1),
    metric("ResearchRequests24h", outcomes.requested),
    metric("ResearchCompleted24h", outcomes.completed),
    metric("ResearchLimitedPublication24h", outcomes.limited),
    metric("ResearchFailed24h", outcomes.failed),
    metric("ResearchCancelled24h", outcomes.cancelled),
  ];
  if (durations.samples > 0)
    data.push(
      metric("ResearchEndToEndP95Seconds24h", Number(durations.p95), "Seconds"),
    );
  process.stdout.write(JSON.stringify(data));
} finally {
  await pool?.end();
}
