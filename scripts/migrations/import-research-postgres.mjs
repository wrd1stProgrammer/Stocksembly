import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool } from "pg";

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid transfer identifier");
  return '"' + value + '"';
}
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function databaseConfiguration() {
  if (process.env.STOCKSEMBLY_DATABASE_URL) {
    const url = new URL(process.env.STOCKSEMBLY_DATABASE_URL);
    if (url.search)
      throw new Error(
        "Database URL query overrides are not supported by migration tools",
      );
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return {
      connectionString: url.toString(),
      max: 1,
      ...(!local
        ? {
            ssl: {
              rejectUnauthorized: true,
              ca: await readFile(
                process.env.STOCKSEMBLY_DB_CA_PATH ??
                  "/etc/ssl/certs/aws-rds-global-bundle.pem",
                "utf8",
              ),
            },
          }
        : {}),
    };
  }
  const arn = process.env.STOCKSEMBLY_DB_SECRET_ARN;
  const region = process.env.AWS_REGION;
  if (!arn || !region)
    throw new Error("Database URL or RDS secret and region required");
  const secrets = new SecretsManagerClient({ region });
  try {
    const response = await secrets.send(
      new GetSecretValueCommand({ SecretId: arn }),
    );
    if (!response.SecretString) throw new Error("Database secret empty");
    const secret = JSON.parse(response.SecretString);
    if (
      !secret.username ||
      !secret.password ||
      !(process.env.STOCKSEMBLY_DB_HOST ?? secret.host)
    )
      throw new Error("Database secret missing required fields");
    return {
      host: process.env.STOCKSEMBLY_DB_HOST ?? secret.host,
      port: Number(process.env.STOCKSEMBLY_DB_PORT ?? secret.port ?? 5432),
      user: secret.username,
      password: secret.password,
      database:
        process.env.STOCKSEMBLY_DB_NAME ?? secret.dbname ?? "stocksembly",
      max: 1,
      ssl: {
        rejectUnauthorized: true,
        ca: await readFile(
          process.env.STOCKSEMBLY_DB_CA_PATH ??
            "/etc/ssl/certs/aws-rds-global-bundle.pem",
          "utf8",
        ),
      },
    };
  } finally {
    secrets.destroy();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/migrations/import-research-postgres.mjs --archive DIRECTORY [--commit --expected-sha256 HASH] [--preserve-unmatched-principals FILE]\nDefault: import and verify inside a rolled-back transaction. Destination must already have PostgreSQL research migrations applied and contain no research.",
    );
    return;
  }
  const allowed = new Set([
    "--archive",
    "--expected-sha256",
    "--commit",
    "--preserve-unmatched-principals",
  ]);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.has(key)) throw new Error("Unknown argument");
    if (key === "--commit") options.commit = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error("Argument value missing");
      options[key] = value;
    }
  }
  if (!options["--archive"]) throw new Error("--archive required");
  const directory = resolve(options["--archive"]);
  const raw = await readFile(join(directory, "manifest.json"));
  const digest = hash(raw);
  if (options.commit && options["--expected-sha256"] !== digest)
    throw new Error("Commit requires the reviewed manifest SHA-256");
  let preservedPrincipals = [];
  if (options["--preserve-unmatched-principals"]) {
    const review = JSON.parse(
      await readFile(
        resolve(options["--preserve-unmatched-principals"]),
        "utf8",
      ),
    );
    if (
      review.manifestSha256 !== digest ||
      !Array.isArray(review.principals) ||
      !review.principals.length ||
      review.principals.some((id) => typeof id !== "string" || !id) ||
      new Set(review.principals).size !== review.principals.length
    ) {
      throw new Error("Invalid unmatched-principal review for this archive");
    }
    preservedPrincipals = review.principals;
  }
  const manifest = JSON.parse(raw);
  if (
    manifest.format !== "stocksembly-research-transfer-v1" ||
    manifest.sourceSchemaVersion !== 32 ||
    !Array.isArray(manifest.tables)
  )
    throw new Error("Unsupported transfer manifest");
  const names = new Set();
  for (const table of manifest.tables) {
    identifier(table.name);
    if (
      names.has(table.name) ||
      table.file !== table.name + ".jsonl" ||
      !Number.isSafeInteger(table.rows) ||
      table.rows < 0 ||
      !/^[a-f0-9]{64}$/.test(table.sha256)
    )
      throw new Error("Invalid table manifest");
    names.add(table.name);
    if (
      !Array.isArray(table.columns) ||
      !table.columns.length ||
      new Set(table.columns.map((column) => column.name)).size !==
        table.columns.length
    )
      throw new Error("Invalid columns");
    for (const column of table.columns) identifier(column.name);
    const fileHash = createHash("sha256");
    for await (const chunk of createReadStream(join(directory, table.file)))
      fileHash.update(chunk);
    if (fileHash.digest("hex") !== table.sha256)
      throw new Error("Archive checksum mismatch: " + table.name);
  }
  const pool = new Pool(await databaseConfiguration());
  const client = await pool.connect().catch(async (error) => {
    await pool.end();
    throw error;
  });
  let transaction = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    await client.query("SELECT pg_advisory_xact_lock(1937010547, 2)");
    const previous = await client.query(
      "SELECT manifest_sha256 FROM research.storage_imports WHERE manifest_sha256=$1",
      [digest],
    );
    if (previous.rowCount) {
      await client.query("ROLLBACK");
      transaction = false;
      console.log(
        JSON.stringify({ status: "already_imported", manifestSha256: digest }),
      );
      return;
    }
    const target = (
      await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='research' AND table_type='BASE TABLE' ORDER BY table_name",
      )
    ).rows.map((row) => row.table_name);
    const excluded = new Set([
      "schema_migrations",
      "storage_imports",
      "maintenance_leases",
    ]);
    const optional = manifest.newsIncluded
      ? new Set()
      : new Set(["news_events", "news_candidate_classifications"]);
    const expected = target.filter(
      (name) => !excluded.has(name) && !optional.has(name),
    );
    if (
      expected.length !== names.size ||
      expected.some((name) => !names.has(name))
    )
      throw new Error("Transfer table set does not match target schema");
    // Exclusive locks protect the complete import against accidental new writes.
    for (const table of target.filter((name) => !excluded.has(name))) {
      await client.query(
        "LOCK TABLE research." +
          identifier(table) +
          " IN ACCESS EXCLUSIVE MODE",
      );
      const count = (
        await client.query(
          "SELECT count(*)::text AS count FROM research." + identifier(table),
        )
      ).rows[0].count;
      if (count !== "0") throw new Error("Destination is not empty: " + table);
    }
    const fks = (
      await client.query(`SELECT cls.relname AS table_name, con.conname, con.condeferrable, con.condeferred
      FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cls.relnamespace
      WHERE ns.nspname='research' AND con.contype='f'`)
    ).rows;
    for (const fk of fks)
      await client.query(
        "ALTER TABLE research." +
          identifier(fk.table_name) +
          " ALTER CONSTRAINT " +
          identifier(fk.conname) +
          " DEFERRABLE INITIALLY DEFERRED",
      );
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    for (const table of manifest.tables) {
      const tableName = "research." + identifier(table.name);
      const columns = (
        await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='research' AND table_name=$1 ORDER BY ordinal_position",
          [table.name],
        )
      ).rows.map((row) => row.column_name);
      if (
        columns.length !== table.columns.length ||
        columns.some((column, index) => column !== table.columns[index].name)
      )
        throw new Error("Column mapping mismatch: " + table.name);
      await client.query("ALTER TABLE " + tableName + " DISABLE TRIGGER USER");
      let count = 0;
      let batch = [];
      const flush = async () => {
        if (!batch.length) return;
        const params = [];
        const values = batch
          .map(
            (row) =>
              "(" +
              row
                .map((value) => {
                  params.push(value);
                  return "$" + params.length;
                })
                .join(",") +
              ")",
          )
          .join(",");
        const returned = await client.query(
          "INSERT INTO " +
            tableName +
            " (" +
            columns.map(identifier).join(",") +
            ") VALUES " +
            values +
            " RETURNING " +
            columns.map(identifier).join(","),
          params,
        );
        const normalize = (row) =>
          JSON.stringify(
            row.map((value, index) => {
              if (value === null) return null;
              const type = table.columns[index].type.toUpperCase();
              if (type === "INTEGER") return BigInt(String(value)).toString();
              if (type === "REAL") return Number(value).toPrecision(17);
              return String(value);
            }),
          );
        const expectedRows = batch.map(normalize).sort();
        const storedRows = returned.rows
          .map((row) => normalize(columns.map((column) => row[column])))
          .sort();
        if (
          expectedRows.length !== storedRows.length ||
          expectedRows.some((row, index) => row !== storedRows[index])
        )
          throw new Error("Stored value verification failed: " + table.name);
        batch = [];
      };
      const loadedHash = createHash("sha256");
      const stream = createReadStream(join(directory, table.file));
      stream.on("data", (chunk) => loadedHash.update(chunk));
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          const row = JSON.parse(line);
          if (
            !Array.isArray(row) ||
            row.length !== columns.length ||
            row.some((value) => value !== null && typeof value !== "string")
          )
            throw new Error("Invalid transfer row");
          batch.push(row);
          count++;
          if (batch.length === 200) await flush();
        }
      } finally {
        lines.close();
      }
      await flush();
      if (loadedHash.digest("hex") !== table.sha256)
        throw new Error("Archive changed during import: " + table.name);
      const stored = (
        await client.query("SELECT count(*)::text AS count FROM " + tableName)
      ).rows[0].count;
      if (count !== table.rows || stored !== String(table.rows))
        throw new Error("Row count mismatch: " + table.name);
    }
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    for (const table of manifest.tables)
      await client.query(
        "ALTER TABLE research." +
          identifier(table.name) +
          " ENABLE TRIGGER USER",
      );
    const badEvents =
      await client.query(`SELECT r.run_id FROM research.runs r LEFT JOIN research.run_events e USING(run_id)
      GROUP BY r.run_id,r.last_event_seq HAVING count(e.sequence)<>r.last_event_seq OR coalesce(max(e.sequence),0)<>r.last_event_seq OR (count(e.sequence)>0 AND min(e.sequence)<>1) LIMIT 1`);
    if (badEvents.rowCount)
      throw new Error("Imported event sequence/high-water mark mismatch");
    const accounts = await client.query(
      "SELECT to_regclass('public.app_users') AS accounts",
    );
    if (accounts.rows[0].accounts) {
      const orphan = await client.query(
        "SELECT DISTINCT r.principal_id FROM research.research_requests r LEFT JOIN public.app_users a ON a.principal_id=r.principal_id WHERE a.principal_id IS NULL",
      );
      const unmatched = orphan.rows.map((row) => row.principal_id);
      if (
        unmatched.length !== preservedPrincipals.length ||
        unmatched.some((id) => !preservedPrincipals.includes(id))
      )
        throw new Error(
          "Imported research references an account absent from PostgreSQL",
        );
      const mismatch = await client.query(
        "SELECT r.run_id FROM research.research_requests r JOIN public.research_run_ownership o ON o.run_id::text=r.run_id WHERE o.principal_id<>r.principal_id LIMIT 1",
      );
      if (mismatch.rowCount)
        throw new Error("Research account ownership mismatch");
    } else if (options.commit && process.env.NODE_ENV === "production")
      throw new Error("Production import requires existing account tables");
    for (const fk of fks)
      await client.query(
        "ALTER TABLE research." +
          identifier(fk.table_name) +
          " ALTER CONSTRAINT " +
          identifier(fk.conname) +
          (fk.condeferrable
            ? " DEFERRABLE INITIALLY " +
              (fk.condeferred ? "DEFERRED" : "IMMEDIATE")
            : " NOT DEFERRABLE"),
      );
    await client.query(
      "INSERT INTO research.storage_imports(manifest_sha256,source_schema_version,source_tables_json) VALUES($1,$2,$3)",
      [
        digest,
        manifest.sourceSchemaVersion,
        JSON.stringify(
          manifest.tables.map(({ name, rows, sha256 }) => ({
            name,
            rows,
            sha256,
          })),
        ),
      ],
    );
    await client.query(options.commit ? "COMMIT" : "ROLLBACK");
    transaction = false;
    console.log(
      JSON.stringify({
        status: options.commit ? "imported" : "dry_run_verified",
        manifestSha256: digest,
        preservedUnmatchedPrincipals: preservedPrincipals.length,
        tables: manifest.tables.length,
        rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
      }),
    );
  } finally {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      error && typeof error === "object" && "code" in error
        ? "Import failed: database or filesystem error (" + error.code + ")"
        : error instanceof Error
          ? error.message
          : "Import failed",
    );
    process.exitCode = 1;
  });
