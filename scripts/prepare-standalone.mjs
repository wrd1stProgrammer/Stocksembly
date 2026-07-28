import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const projectRequire = createRequire(join(process.cwd(), "package.json"));
const betterSqliteDirectory = dirname(
  projectRequire.resolve("better-sqlite3/package.json"),
);
const zodDirectory = dirname(projectRequire.resolve("zod/package.json"));
const decimalDirectory = dirname(
  projectRequire.resolve("decimal.js/package.json"),
);
const betterSqliteRequire = createRequire(
  join(betterSqliteDirectory, "package.json"),
);
const bindingsDirectory = dirname(
  betterSqliteRequire.resolve("bindings/package.json"),
);
const bindingsRequire = createRequire(join(bindingsDirectory, "package.json"));
const fileUriToPathDirectory = dirname(
  bindingsRequire.resolve("file-uri-to-path/package.json"),
);
const findPackageDirectory = (resolver, specifier) => {
  let directory = dirname(resolver.resolve(specifier));
  while (!existsSync(join(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate ${specifier}`);
    directory = parent;
  }
  return directory;
};
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

const migrationsSource = "src/research/server/persistence/sqlite/migrations";
await Promise.all([
  rm(".next/standalone/research-worker", { recursive: true, force: true }),
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
    "scripts/standalone-worker-entry.mjs",
    ".next/standalone/research-worker/worker.mjs",
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
  cp(betterSqliteDirectory, ".next/standalone/node_modules/better-sqlite3", {
    recursive: true,
    force: true,
    dereference: true,
  }),
  cp(bindingsDirectory, ".next/standalone/node_modules/bindings", {
    recursive: true,
    force: true,
    dereference: true,
  }),
  cp(fileUriToPathDirectory, ".next/standalone/node_modules/file-uri-to-path", {
    recursive: true,
    force: true,
    dereference: true,
  }),
  cp(zodDirectory, ".next/standalone/node_modules/zod", {
    recursive: true,
    force: true,
    dereference: true,
  }),
  cp(decimalDirectory, ".next/standalone/node_modules/decimal.js", {
    recursive: true,
    force: true,
    dereference: true,
  }),
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
