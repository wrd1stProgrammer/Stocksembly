import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join, relative, resolve } from "node:path";
import { inspectImportBoundary } from "../../productionImportBoundary";
import { moduleSpecifiers } from "../../productionImportBoundaryParser";
import { inspectArchitectureSyntax } from "./architectureSyntax";

const sourcePattern = /\.[cm]?[jt]sx?$/;
const testPathPattern = /(?:\.(?:test|spec)\.|test[-_.]?support|\/test\/)/i;
const forbiddenDomainImports = [
  "next",
  "react",
  "better-sqlite3",
  "commander",
] as const;
const forbiddenNodeBuiltinFamilies = ["fs", "child_process"] as const;

export class ResearchArchitectureError extends Error {
  readonly name = "ResearchArchitectureError";
}

export type ArchitectureReport = {
  readonly visitedFiles: readonly string[];
  readonly violations: readonly string[];
};

export type ArchitectureOptions = {
  readonly rootDir: string;
  readonly requiredRoots?: readonly string[];
};

function normalized(path: string): string {
  return path.replaceAll("\\", "/");
}

function isForbiddenNodeBuiltin(specifier: string): boolean {
  if (!isBuiltin(specifier)) return false;
  const canonical = specifier.startsWith("node:")
    ? specifier.slice("node:".length)
    : specifier;
  return forbiddenNodeBuiltinFamilies.some(
    (family) => canonical === family || canonical.startsWith(`${family}/`),
  );
}

async function sourceFiles(path: string): Promise<readonly string[]> {
  let entry: Stats;
  try {
    entry = await stat(path);
  } catch (error) {
    throw new ResearchArchitectureError(
      `required root unreadable: ${path}: ${String(error)}`,
    );
  }
  if (entry.isFile()) return sourcePattern.test(path) ? [path] : [];
  if (!entry.isDirectory()) {
    throw new ResearchArchitectureError(
      `required root is not a file or directory: ${path}`,
    );
  }
  let children: Dirent[];
  try {
    children = await readdir(path, { withFileTypes: true });
  } catch (error) {
    throw new ResearchArchitectureError(
      `required root unreadable: ${path}: ${String(error)}`,
    );
  }
  const files: string[] = [];
  for (const child of children) {
    const childPath = join(path, child.name);
    if (child.isDirectory()) files.push(...(await sourceFiles(childPath)));
    else if (child.isFile() && sourcePattern.test(child.name))
      files.push(childPath);
  }
  return files;
}

async function graphFor(
  rootDir: string,
  files: readonly string[],
): Promise<readonly string[]> {
  if (files.length === 0) return [];
  const report = await inspectImportBoundary({
    rootDir,
    tsconfigPath: join(rootDir, "tsconfig.json"),
    roots: files.map((file) => relative(rootDir, file)),
    scope: "calibration",
  });
  return report.visitedFiles;
}

async function sourcesFor(
  rootDir: string,
  files: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const sources = new Map<string, string>();
  for (const file of files) {
    try {
      sources.set(
        normalized(relative(rootDir, file)),
        await readFile(file, "utf8"),
      );
    } catch (error) {
      throw new ResearchArchitectureError(
        `source unreadable: ${file}: ${String(error)}`,
      );
    }
  }
  return sources;
}

function inspectDomainGraph(
  sources: ReadonlyMap<string, string>,
  violations: string[],
): void {
  for (const [path, source] of sources) {
    if (!path.startsWith("src/research/domain/")) {
      violations.push(`DOMAIN_DEPENDENCY_ESCAPE:${path}`);
    }
    for (const specifier of moduleSpecifiers(path, source)) {
      if (
        isForbiddenNodeBuiltin(specifier) ||
        forbiddenDomainImports.some((forbidden) => specifier === forbidden)
      ) {
        violations.push(`DOMAIN_INFRASTRUCTURE_IMPORT:${path}:${specifier}`);
      }
      if (
        /research\/(?:application|ports|worker|server|adapters)(?:\/|$)/.test(
          specifier,
        )
      ) {
        violations.push(`DOMAIN_INVERTED_IMPORT:${path}:${specifier}`);
      }
    }
  }
}

function inspectApplicationGraph(
  sources: ReadonlyMap<string, string>,
  violations: string[],
): void {
  for (const path of sources.keys()) {
    if (
      !path.startsWith("src/research/application/") &&
      !path.startsWith("src/research/domain/") &&
      !path.startsWith("src/research/ports/")
    ) {
      violations.push(`APPLICATION_DEPENDENCY_ESCAPE:${path}`);
    }
  }
}

function inspectProductionSources(
  sources: ReadonlyMap<string, string>,
  violations: string[],
): void {
  for (const [path, source] of sources) {
    const specifiers = moduleSpecifiers(path, source);
    if (
      !testPathPattern.test(path) &&
      specifiers.some((specifier) =>
        /(?:ports\/test|strictFakes|storeFakes|serviceFakes)/.test(specifier),
      )
    ) {
      violations.push(`PRODUCTION_TEST_FAKE_IMPORT:${path}`);
    }
    if (
      /(?:fixture|ports\/test)/i.test(path) &&
      (/\bmode\s*:\s*["']official["']/.test(source) ||
        /\bcreateOfficialComposition\s*\(/.test(source))
    ) {
      violations.push(`FIXTURE_BINDS_OFFICIAL_MODE:${path}`);
    }
  }
}

async function inspectGraphPaths(
  rootDir: string,
  roots: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  return sourcesFor(rootDir, await graphFor(rootDir, roots));
}

export async function inspectResearchArchitecture(
  options: ArchitectureOptions,
): Promise<ArchitectureReport> {
  const rootDir = resolve(options.rootDir);
  const requiredRoots = options.requiredRoots ?? ["src/research"];
  const discovered = (
    await Promise.all(
      requiredRoots.map((root) => sourceFiles(resolve(rootDir, root))),
    )
  )
    .flat()
    .filter((file) => !testPathPattern.test(normalized(file)));
  const production = await inspectGraphPaths(rootDir, discovered);
  const violations: string[] = [];
  inspectProductionSources(production, violations);

  const domainRoots = discovered.filter((file) =>
    normalized(relative(rootDir, file)).startsWith("src/research/domain/"),
  );
  inspectDomainGraph(await inspectGraphPaths(rootDir, domainRoots), violations);

  const applicationRoots = discovered.filter((file) =>
    normalized(relative(rootDir, file)).startsWith("src/research/application/"),
  );
  inspectApplicationGraph(
    await inspectGraphPaths(rootDir, applicationRoots),
    violations,
  );

  const officialRoot = resolve(
    rootDir,
    "src/research/compositions/official.ts",
  );
  let officialFiles = new Set<string>();
  if (discovered.includes(officialRoot)) {
    const official = await inspectGraphPaths(rootDir, [officialRoot]);
    officialFiles = new Set(official.keys());
    for (const path of official.keys()) {
      if (/(?:ports\/test|\/fixture|mockResearch|inMemory)/i.test(path)) {
        violations.push(`OFFICIAL_TEST_OR_FIXTURE_DEPENDENCY:${path}`);
      }
    }
  }

  violations.push(...inspectArchitectureSyntax(production, officialFiles));

  const clients = [...production].filter(([, source]) =>
    /^\s*["']use client["'];?/m.test(source),
  );
  for (const [client] of clients) {
    const graph = await inspectGraphPaths(rootDir, [resolve(rootDir, client)]);
    for (const path of graph.keys()) {
      if (/src\/research\/(?:server|adapters|worker)\//.test(path)) {
        violations.push(`CLIENT_SERVER_ADAPTER_IMPORT:${client}:${path}`);
      }
    }
  }

  return {
    visitedFiles: [...production.keys()].sort(),
    violations: [...new Set(violations)].sort(),
  };
}
