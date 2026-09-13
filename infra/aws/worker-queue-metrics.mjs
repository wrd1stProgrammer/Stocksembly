import { readFile } from "node:fs/promises";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION });
let pool;
try {
  const response = await secrets.send(
    new GetSecretValueCommand({
      SecretId: process.env.STOCKSEMBLY_DB_SECRET_ARN,
    }),
  );
  const secret = JSON.parse(response.SecretString);
  pool = new Pool({
    host: process.env.STOCKSEMBLY_DB_HOST ?? secret.host,
    port: Number(process.env.STOCKSEMBLY_DB_PORT ?? secret.port ?? 5432),
    user: secret.username,
    password: secret.password,
    database: process.env.STOCKSEMBLY_DB_NAME ?? secret.dbname ?? "stocksembly",
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
    WHERE runs.status = 'running' AND jobs.kind = 'research'`);
  const {
    rows: [durations],
  } = await pool.query(`
    WITH completed AS (
      SELECT runs.run_id, runs.created_at::timestamptz AS started,
        MIN(report_versions.published_at::timestamptz) AS finished
      FROM runs JOIN report_versions USING(run_id) JOIN reports USING(report_id)
      WHERE runs.status IN ('completed','complete-with-limitations')
        AND reports.state = 'published' AND report_versions.status IN ('complete','complete_with_limitations')
        AND report_versions.published_at::timestamptz > now() - interval '24 hours'
      GROUP BY runs.run_id, runs.created_at
    ) SELECT COUNT(*)::int AS samples,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished - started)) AS p95
      FROM completed WHERE finished >= started`);
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
  ];
  if (durations.samples > 0)
    data.push(
      metric("ResearchEndToEndP95Seconds24h", Number(durations.p95), "Seconds"),
    );
  process.stdout.write(JSON.stringify(data));
} finally {
  await pool?.end();
  secrets.destroy();
}
