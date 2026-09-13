import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const webOnly = process.argv.includes("--web-only");
const workerOnly = process.argv.includes("--worker-only");
const outputRoot = workerOnly
  ? ".stocksembly-verification/worker-runtime"
  : ".next/standalone";

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
if (!workerOnly && existsSync(`${outputRoot}/server.js`)) {
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
  rm(`${outputRoot}/research-worker`, { recursive: true, force: true }),
  rm(`${outputRoot}/briefing-worker`, { recursive: true, force: true }),
  ...(existsSync(migrationsSource)
    ? [rm(`${outputRoot}/migrations`, { recursive: true, force: true })]
    : []),
]);
const optionalCopies = [
  [
    ".stocksembly-verification/research-worker/leaseWorker.js",
    `${outputRoot}/research-worker/leaseWorker.js`,
  ],
  [
    ".stocksembly-verification/research-worker/assets",
    `${outputRoot}/research-worker/assets`,
  ],
  [
    "scripts/standalone-worker-entry.mjs",
    `${outputRoot}/research-worker/worker.mjs`,
  ],
  [
    ".stocksembly-verification/briefing-worker/briefingWorker.js",
    `${outputRoot}/briefing-worker/briefingWorker.js`,
  ],
  [
    ".stocksembly-verification/briefing-worker/assets",
    `${outputRoot}/briefing-worker/assets`,
  ],
  [
    "scripts/standalone-briefing-worker-entry.mjs",
    `${outputRoot}/briefing-worker/worker.mjs`,
  ],
  [migrationsSource, `${outputRoot}/migrations`],
].flatMap(([source, destination]) =>
  existsSync(source) && (!webOnly || source === migrationsSource)
    ? [{ source, destination }]
    : [],
);
await Promise.all([
  mkdir(`${outputRoot}/.next`, { recursive: true }),
  ...(existsSync(migrationsSource)
    ? []
    : [mkdir(`${outputRoot}/migrations`, { recursive: true })]),
  mkdir(`${outputRoot}/node_modules`, { recursive: true }),
  mkdir(`${outputRoot}/node_modules/@next`, { recursive: true }),
  mkdir(`${outputRoot}/node_modules/@swc`, { recursive: true }),
]);
await Promise.all([
  ...(!workerOnly
    ? [
        cp(".next/static", `${outputRoot}/.next/static`, {
          recursive: true,
          force: true,
        }),
        cp("public", `${outputRoot}/public`, {
          recursive: true,
          force: true,
        }),
      ]
    : []),
  ...(!webOnly
    ? [
        cp(
          ".stocksembly-verification/research-worker/runtimeProbe.js",
          `${outputRoot}/research-worker/runtimeProbe.js`,
          { force: true },
        ),
      ]
    : []),
  ...[...runtimePackages].map(([name, directory]) =>
    cp(directory, join(`${outputRoot}/node_modules`, name), {
      recursive: true,
      force: true,
      dereference: true,
    }),
  ),
  ...nextRuntimePackages.map(({ destination, directory }) =>
    cp(directory, join(`${outputRoot}/node_modules`, destination), {
      recursive: true,
      force: true,
      dereference: true,
    }),
  ),
  ...optionalCopies.map(({ destination, source }) =>
    cp(source, destination, { recursive: true, force: true }),
  ),
]);
