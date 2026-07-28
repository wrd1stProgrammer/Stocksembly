import type { Dirent } from "node:fs";
import {
  mkdtemp as makeTemporaryDirectory,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectImportBoundary } from "./productionImportBoundary";

const temporaryRoots: string[] = [];

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const path = temporaryRoots.pop();
    if (path) await rm(path, { recursive: true, force: true });
  }
});

async function sourceFilesIn(directory: string): Promise<readonly string[]> {
  let entries: readonly Dirent<string>[];
  try {
    entries = await readdir(directory, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFilesIn(path)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

async function productionRoots(): Promise<readonly string[]> {
  const components = (await sourceFilesIn("src/components/research")).filter(
    (path) => !path.includes(".test."),
  );
  const apiRoutes = await sourceFilesIn("app/api");
  return [
    "app/research/[symbol]/page.tsx",
    "app/research-fixture/[symbol]/page.tsx",
    "app/showcase/office-calibration/page.tsx",
    "src/research/compositions/fixture.ts",
    "src/research/compositions/official.ts",
    "src/research/compositions/calibration.ts",
    ...components,
    ...apiRoutes,
  ];
}

async function temporaryRoot(): Promise<string> {
  const path = await makeTemporaryDirectory(
    join(tmpdir(), "stocksembly-boundary-restrictions-"),
  );
  temporaryRoots.push(path);
  return path;
}

describe("restricted composition attestation boundary", () => {
  it("allows only the read facade and composition constructor transitive edges", async () => {
    const report = await inspectImportBoundary({
      roots: await productionRoots(),
      scope: "calibration",
    });
    expect(
      report.violations.filter((violation) =>
        violation.includes("RESTRICTED_INTERNAL_MODULE"),
      ),
    ).toEqual([]);
  });

  it("rejects a direct authority mutation through alias, require, and dynamic edges", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "src/research"), { recursive: true });
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }),
    );
    await writeFile(
      join(root, "entry.ts"),
      [
        'import "@/neutral";',
        'const required = require("@/neutralRequire");',
        'void import("@/neutralDynamic");',
        "void required;",
      ].join("\n"),
    );
    for (const helper of ["neutral", "neutralRequire", "neutralDynamic"]) {
      await writeFile(
        join(root, `src/${helper}.ts`),
        'export { value } from "./research/compositionMode.authority.internal";\n',
      );
    }
    await writeFile(
      join(root, "src/research/compositionMode.authority.internal.ts"),
      "export const value = 1;\n",
    );
    const report = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["entry.ts"],
      scope: "calibration",
    });
    expect(
      report.violations.filter((violation) =>
        violation.includes("RESTRICTED_INTERNAL_MODULE"),
      ),
    ).not.toHaveLength(0);
  });

  it("keeps scanner modules at or below the pure LOC ceiling", async () => {
    const files = [
      "src/research/productionImportBoundary.ts",
      "src/research/productionImportBoundaryRules.ts",
      "src/research/productionImportBoundaryResolver.ts",
      "src/research/productionImportBoundaryParser.ts",
    ] as const;
    const counts = await Promise.all(
      files.map(async (file) => {
        const source = await readFile(file, "utf8");
        return source.split(/\r?\n/).filter((line) => {
          const trimmed = line.trim();
          return (
            trimmed.length > 0 &&
            !trimmed.startsWith("//") &&
            !trimmed.startsWith("#") &&
            !trimmed.startsWith("--")
          );
        }).length;
      }),
    );
    expect(Math.max(...counts)).toBeLessThanOrEqual(250);
  });
});
