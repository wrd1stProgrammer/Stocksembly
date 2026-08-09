import { spawn } from "node:child_process";
import { access, link, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";

const mode = process.argv[2] ?? "once";
const host = process.env.STOCKSEMBLY_PRODUCTION_SYNC_HOST?.trim();
const keyPath = process.env.STOCKSEMBLY_PRODUCTION_SYNC_SSH_KEY?.trim();
const intervalMs = Number.parseInt(
  process.env.STOCKSEMBLY_PRODUCTION_SYNC_INTERVAL_MS ?? "30000",
  10,
);

if (mode !== "once" && mode !== "watch")
  throw new Error("usage: research-production-sync.mjs [once|watch]");
if (!host || !keyPath)
  throw new Error(
    "STOCKSEMBLY_PRODUCTION_SYNC_HOST and STOCKSEMBLY_PRODUCTION_SYNC_SSH_KEY are required",
  );
if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/u.test(host))
  throw new Error("invalid production sync host");
if (!isAbsolute(keyPath))
  throw new Error("production sync SSH key must be an absolute path");
if (!Number.isSafeInteger(intervalMs) || intervalMs < 10_000)
  throw new Error("production sync interval must be at least 10000ms");
await access(keyPath);

const dataRoot = process.env.STOCKSEMBLY_DATA_DIR
  ? process.env.STOCKSEMBLY_DATA_DIR
  : join(
      process.env.HOME ?? homedir(),
      "Library",
      "Application Support",
      "Stocksembly",
      "research",
    );
if (!isAbsolute(dataRoot))
  throw new Error("STOCKSEMBLY_DATA_DIR must be absolute");

const databasePath = join(dataRoot, "research.sqlite");
const artifactRoot = join(dataRoot, "artifacts", "sha256");
const sshArguments = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-i",
  keyPath,
];

let syncing = false;
let stopped = false;
let lastFingerprint = "";

async function synchronize() {
  if (syncing) return;
  syncing = true;
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "stocksembly-production-sync-"),
  );
  try {
    const snapshotPath = join(temporaryRoot, "research.sqlite");
    const stagedArtifacts = join(temporaryRoot, "artifacts", "sha256");
    await mkdir(stagedArtifacts, { recursive: true });

    const database = new Database(databasePath, { readonly: true });
    try {
      await database.backup(snapshotPath);
    } finally {
      database.close();
    }

    const snapshot = new Database(snapshotPath);
    let digests;
    try {
      pruneUnpublishedRuns(snapshot);
      digests = snapshot
        .prepare(
          "SELECT DISTINCT content_hash FROM artifacts ORDER BY content_hash",
        )
        .all()
        .map((row) => row.content_hash);
    } finally {
      snapshot.close();
    }

    for (const digest of digests) {
      const source = join(artifactRoot, digest.slice(0, 2), digest.slice(2));
      const destination = join(
        stagedArtifacts,
        digest.slice(0, 2),
        digest.slice(2),
      );
      await mkdir(dirname(destination), { recursive: true });
      await link(source, destination);
    }

    const remoteImport = `/var/lib/stocksembly/research/import-local-sync-${Date.now()}-${process.pid}.sqlite`;
    await run("rsync", [
      "-a",
      "--ignore-existing",
      "--partial",
      "-e",
      `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i ${keyPath}`,
      `${stagedArtifacts}/`,
      `${host}:/var/lib/stocksembly/research/artifacts/sha256/`,
    ]);
    await run("scp", [
      ...sshArguments,
      snapshotPath,
      `${host}:${remoteImport}`,
    ]);

    const mergeProgram = productionMergeProgram();
    const remoteProgram = productionRemoteProgram(
      remoteImport,
      Buffer.from(mergeProgram).toString("base64"),
    );
    await run("ssh", [
      ...sshArguments,
      host,
      `echo '${Buffer.from(remoteProgram).toString("base64")}' | base64 -d | bash`,
    ]);
    process.stdout.write(
      `${JSON.stringify({ kind: "production_research_sync", status: "complete", artifacts: digests.length })}\n`,
    );
  } finally {
    syncing = false;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function pruneUnpublishedRuns(database) {
  database.pragma("foreign_keys = ON");
  const prune = database.transaction(() => {
    database.exec(`CREATE TEMP TABLE unpublished_runs(run_id TEXT PRIMARY KEY);
      INSERT INTO unpublished_runs
      SELECT run_id FROM runs
      WHERE run_id NOT IN (
        SELECT run_id FROM reports WHERE state = 'published'
      );
      DELETE FROM agent_output_commits
      WHERE attempt_id IN (
        SELECT attempt_id FROM attempts WHERE run_id IN unpublished_runs
      );
      DELETE FROM run_lineage
      WHERE child_run_id IN unpublished_runs
         OR parent_run_id IN unpublished_runs
         OR prior_report_id IN (
           SELECT report_id FROM reports WHERE run_id IN unpublished_runs
         );
      DELETE FROM runs WHERE run_id IN unpublished_runs;
      DELETE FROM idempotency_records;`);
  });
  prune.immediate();
  if (database.pragma("foreign_key_check").length !== 0)
    throw new Error("local production-sync snapshot is inconsistent");
}

function fingerprint() {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM reports WHERE state = 'published') AS reports,
        COALESCE((SELECT MAX(created_at) FROM reports WHERE state = 'published'), '') AS latest_report,
        (SELECT COUNT(*) FROM questions WHERE status = 'answered') AS answers,
        COALESCE((SELECT MAX(created_at) FROM questions WHERE status = 'answered'), '') AS latest_answer`)
      .get();
    return JSON.stringify(row);
  } finally {
    database.close();
  }
}

async function check(force = false) {
  const current = fingerprint();
  if (!force && current === lastFingerprint) return;
  await synchronize();
  lastFingerprint = fingerprint();
}

function run(command, argumentsValue) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsValue, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let standardOutput = "";
    let standardError = "";
    child.stdout.on("data", (chunk) => {
      standardOutput += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      standardError += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        if (standardOutput.trim()) process.stdout.write(standardOutput);
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code}: ${standardError.trim() || standardOutput.trim()}`,
        ),
      );
    });
  });
}

function productionMergeProgram() {
  return String.raw`
const { writeFileSync } = require('node:fs');
const Database = require('/app/node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3');
(async () => {
  const mainPath = '/var/lib/stocksembly/research/research.sqlite';
  const importPath = process.argv[2];
  const manifestPath = process.argv[3];
  const database = new Database(mainPath);
  const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
  try {
    database.pragma('busy_timeout = 30000');
    await database.backup('/var/lib/stocksembly/research/research.sqlite.before-local-sync');
    database.pragma('foreign_keys = OFF');
    database.exec("ATTACH DATABASE '" + importPath.replaceAll("'", "''") + "' AS imported");
    const tables = database.prepare(
      "SELECT name FROM imported.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations','maintenance_leases') ORDER BY name"
    ).all().map((row) => row.name);
    const transaction = database.transaction(() => {
      for (const table of tables) {
        const tableName = quote(table);
        const columns = database
          .prepare('PRAGMA imported.table_info(' + tableName + ')')
          .all();
        const names = columns.map((column) => quote(column.name));
        const primary = columns
          .filter((column) => column.pk > 0)
          .sort((left, right) => left.pk - right.pk);
        const missing = primary.length
          ? ' WHERE NOT EXISTS (SELECT 1 FROM main.' + tableName +
            ' AS target WHERE ' +
            primary.map((column) =>
              'target.' + quote(column.name) + ' = source.' + quote(column.name)
            ).join(' AND ') + ')'
          : '';
        database.exec(
          'INSERT OR IGNORE INTO main.' + tableName + ' (' + names.join(',') +
          ') SELECT ' + names.map((name) => 'source.' + name).join(',') +
          ' FROM imported.' + tableName + ' AS source' + missing
        );
      }
    });
    transaction.immediate();
    const digests = database.prepare('SELECT DISTINCT content_hash FROM imported.artifacts ORDER BY content_hash').all().map((row) => row.content_hash);
    writeFileSync(manifestPath, digests.join('\n') + (digests.length ? '\n' : ''), { mode: 0o600 });
    database.exec('DETACH DATABASE imported');
    database.pragma('foreign_keys = ON');
    const foreignKeyIssues = database.pragma('foreign_key_check').length;
    if (foreignKeyIssues !== 0) throw new Error('production sync foreign key check failed');
    const reports = database.prepare("SELECT COUNT(*) AS count FROM reports WHERE state='published'").get().count;
    console.log(JSON.stringify({ kind: 'production_research_merge', reports, foreignKeyIssues }));
  } finally {
    database.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
}

function productionRemoteProgram(importPath, encodedMerge) {
  const manifestPath = `${importPath}.digests`;
  const stagePath = `${importPath}.s3`;
  return `set -euo pipefail
import_path='${importPath}'
manifest_path='${manifestPath}'
stage_path='${stagePath}'
cleanup() {
  rm -f "$import_path" "$manifest_path"
  find "$stage_path" -type f -delete 2>/dev/null || true
  find "$stage_path" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT
image=$(sudo docker inspect --format '{{.Config.Image}}' stocksembly-web)
sudo docker run --rm -v /var/lib/stocksembly/research:/var/lib/stocksembly/research "$image" node -e "eval(Buffer.from(process.argv[1],'base64').toString())" '${encodedMerge}' "$import_path" "$manifest_path"
mkdir -p "$stage_path/artifacts/sha256"
while IFS= read -r digest; do
  [ -n "$digest" ] || continue
  prefix=\${digest:0:2}
  source=/var/lib/stocksembly/research/artifacts/sha256/$prefix/\${digest:2}
  destination="$stage_path/artifacts/sha256/$prefix/$digest"
  mkdir -p "$(dirname "$destination")"
  ln "$source" "$destination"
done < "$manifest_path"
bucket=$(sudo docker exec stocksembly-web printenv STOCKSEMBLY_ARTIFACT_BUCKET)
region=$(sudo docker exec stocksembly-web printenv AWS_REGION)
AWS_DEFAULT_REGION="$region" aws s3 sync "$stage_path/artifacts/sha256/" "s3://$bucket/artifacts/sha256/" --size-only --only-show-errors
`;
}

await check(true);
if (mode === "once") process.exit(0);

process.once("SIGINT", () => {
  stopped = true;
});
process.once("SIGTERM", () => {
  stopped = true;
});

while (!stopped) {
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  try {
    await check();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ kind: "production_research_sync", status: "failed", message: error instanceof Error ? error.message : String(error) })}\n`,
    );
  }
}
