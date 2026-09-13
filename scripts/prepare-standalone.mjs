import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const projectRequire = createRequire(join(process.cwd(), "package.json"));
const findPackageDirectory = (resolver, specifier) => {
  let directory = dirname(resolver.resolve(specifier));
  while (!existsSync(join(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate ${specifier}`);
    directory = parent;
  }
  return directory;
};
const runtimePackages = new Map();
async function includePackage(resolver, name) {
  if (runtimePackages.has(name)) return;
  const directory = findPackageDirectory(resolver, name);
  runtimePackages.set(name, directory);
  const manifest = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  const dependencyRequire = createRequire(join(directory, "package.json"));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    await includePackage(dependencyRequire, dependency);
  }
}
for (const name of ["pg", "zod", "decimal.js"])
  await includePackage(projectRequire, name);
let nextRuntimePackages = [];
if (existsSync(".next/standalone/server.js")) {
  const nextRequire = createRequire(
    projectRequire.resolve("next/package.json"),
  );
  nextRuntimePackages = [
    ["@next/env", "@next/env"],
    ["@swc/helpers", "@swc/helpers"],
    ["baseline-browser-mapping", "baseline-browser-mapping"],
    ["caniuse-lite", "caniuse-lite"],
    ["postcss", "postcss"],
    ["styled-jsx", "styled-jsx"],
  ].map(([specifier, destination]) => ({
    destination,
    directory: findPackageDirectory(nextRequire, specifier),
  }));
}

const migrationsSource = "src/research/server/persistence/postgres/migrations";
if (!existsSync(join(migrationsSource, "001_research_baseline.sql"))) {
  throw new Error(
    "PostgreSQL migrations are required in the standalone package",
  );
}
await Promise.all([
  rm(".next/standalone/research-worker", { recursive: true, force: true }),
  rm(".next/standalone/briefing-worker", { recursive: true, force: true }),
  ...(existsSync(migrationsSource)
    ? [rm(".next/standalone/migrations", { recursive: true, force: true })]
    : []),
]);
const optionalCopies = [
  [
    ".stocksembly-verification/research-worker/leaseWorker.js",
    ".next/standalone/research-worker/leaseWorker.js",
  ],
  [
    ".stocksembly-verification/research-worker/assets",
    ".next/standalone/research-worker/assets",
  ],
  [
    "scripts/standalone-worker-entry.mjs",
    ".next/standalone/research-worker/worker.mjs",
  ],
  [
    ".stocksembly-verification/briefing-worker/briefingWorker.js",
    ".next/standalone/briefing-worker/briefingWorker.js",
  ],
  [
    ".stocksembly-verification/briefing-worker/assets",
    ".next/standalone/briefing-worker/assets",
  ],
  [
    "scripts/standalone-briefing-worker-entry.mjs",
    ".next/standalone/briefing-worker/worker.mjs",
  ],
  [migrationsSource, ".next/standalone/migrations"],
].flatMap(([source, destination]) =>
  existsSync(source) ? [{ source, destination }] : [],
);
await Promise.all([
  mkdir(".next/standalone/.next", { recursive: true }),
  ...(existsSync(migrationsSource)
    ? []
    : [mkdir(".next/standalone/migrations", { recursive: true })]),
  mkdir(".next/standalone/node_modules", { recursive: true }),
  mkdir(".next/standalone/node_modules/@next", { recursive: true }),
  mkdir(".next/standalone/node_modules/@swc", { recursive: true }),
]);
await Promise.all([
  cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
    force: true,
  }),
  cp("public", ".next/standalone/public", {
    recursive: true,
    force: true,
  }),
  cp(
    ".stocksembly-verification/research-worker/runtimeProbe.js",
    ".next/standalone/research-worker/runtimeProbe.js",
    { force: true },
  ),
  ...[...runtimePackages].map(([name, directory]) =>
    cp(directory, join(".next/standalone/node_modules", name), {
      recursive: true,
      force: true,
      dereference: true,
    }),
  ),
  ...nextRuntimePackages.map(({ destination, directory }) =>
    cp(directory, join(".next/standalone/node_modules", destination), {
      recursive: true,
      force: true,
      dereference: true,
    }),
  ),
  ...optionalCopies.map(({ destination, source }) =>
    cp(source, destination, { recursive: true, force: true }),
  ),
]);
