import { existsSync } from "node:fs";
import { copyFile, readdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { SentryCli } from "@sentry/cli";

const role = process.argv[2];
if (role === "--help") {
  console.log(
    "Usage: SENTRY_UPLOAD_SOURCE_MAPS=true node scripts/upload-sentry-sourcemaps.mjs <web|worker>\nUploads debug-ID source maps from the packaged runtime, then removes the maps. Requires SENTRY_AUTH_TOKEN or a BuildKit sentry_auth_token secret.",
  );
  process.exit(0);
}
if (role !== "web" && role !== "worker")
  throw new Error("Choose web or worker");
if (process.env.SENTRY_UPLOAD_SOURCE_MAPS !== "true") {
  console.log("Sentry source-map upload disabled for this build");
  process.exit(0);
}
const token =
  process.env.SENTRY_AUTH_TOKEN ||
  (existsSync("/run/secrets/sentry_auth_token")
    ? (await readFile("/run/secrets/sentry_auth_token", "utf8")).trim()
    : "");
if (!token)
  throw new Error("SENTRY_AUTH_TOKEN is required for source-map uploads");

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

const roots =
  role === "web"
    ? [".next/standalone/.next/server", ".next/standalone/.next/static"]
    : [
        ".stocksembly-verification/worker-runtime/research-worker",
        ".stocksembly-verification/worker-runtime/briefing-worker",
        ".stocksembly-verification/worker-runtime/observability",
      ];

// Next's standalone file tracer omits most server maps. Copy maps only for JS
// files actually shipped, before injecting IDs into those exact deployed files.
if (role === "web") {
  for (const map of await files(".next/server")) {
    if (!map.endsWith(".js.map")) continue;
    const destination = join(roots[0], relative(".next/server", map));
    if (existsSync(destination.slice(0, -4))) await copyFile(map, destination);
  }
}
const maps = (await Promise.all(roots.map(files)))
  .flat()
  .filter((path) => path.endsWith(".map"));
if (!maps.length)
  throw new Error("No source maps found in the packaged runtime");
const cli = new SentryCli(undefined, {
  authToken: token,
  org: process.env.SENTRY_ORG || "plutia-0b",
  project: process.env.SENTRY_PROJECT || "stocksembly",
});
await cli.execute(["sourcemaps", "inject", ...roots], true);
await cli.execute(["sourcemaps", "upload", "--validate", ...roots], true);
// Keep source contents private: no map files in the shipped server/static tree.
await Promise.all(maps.map((path) => rm(path)));
console.log(`Uploaded and removed ${maps.length} ${role} source maps`);
