import type { Dirent } from "node:fs";
import {
  mkdtemp as makeTemporaryDirectory,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectImportBoundary } from "./productionImportBoundary";

const forbiddenSegments = [
  "mockResearch",
  "mockResearchFile",
  "canned",
] as const;
const temporaryRoots: string[] = [];

async function filesIn(directory: string): Promise<readonly string[]> {
  let entries: readonly Dirent<string>[];
  try {
    entries = await readdir(directory, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

async function productionRoots(): Promise<readonly string[]> {
  const components = (await filesIn("src/components/research")).filter(
    (path) =>
      !path.endsWith(".test.tsx") && !path.endsWith("OfficeCalibration.tsx"),
  );
  const apiRoutes = (await filesIn("app/api")).filter(
    (path) => !path.includes(".test.") && !path.includes(".spec."),
  );
  return [
    "src/research/compositions/official.ts",
    "app/research/[symbol]/page.tsx",
    ...components,
    ...apiRoutes,
  ];
}

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const path = temporaryRoots.pop();
    if (path) await rm(path, { recursive: true, force: true });
  }
});

describe("official production import boundary", () => {
  it("walks relative, alias, export, require, and dynamic imports transitively", async () => {
    const root = await mkdtemp();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }),
    );
    await writeFile(
      join(root, "entry.ts"),
      [
        'import "@/neutral";',
        'export { value } from "./exported";',
        'const required = require("./required");',
        'void import("./dynamic");',
        "void required;",
      ].join("\n"),
    );
    await writeFile(
      join(root, "src/neutral.ts"),
      'export { value } from "./mockResearchData";\n',
    );
    await writeFile(
      join(root, "src/mockResearchData.ts"),
      "export const value = 1;\n",
    );
    await writeFile(join(root, "exported.ts"), "export const value = 1;\n");
    await writeFile(
      join(root, "required.ts"),
      'export { value } from "./cannedNotes";\n',
    );
    await writeFile(join(root, "cannedNotes.ts"), "export const value = 2;\n");
    await writeFile(
      join(root, "dynamic.ts"),
      'export { value } from "./mockResearchFileData";\n',
    );
    await writeFile(
      join(root, "mockResearchFileData.ts"),
      "export const value = 3;\n",
    );

    const report = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["entry.ts"],
      forbiddenSegments,
    });

    expect(report.visitedFiles.map((path) => relative(root, path))).toEqual(
      expect.arrayContaining([
        "entry.ts",
        "src/neutral.ts",
        "required.ts",
        "dynamic.ts",
      ]),
    );
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("mockResearchData"),
        expect.stringContaining("cannedNotes"),
        expect.stringContaining("mockResearchFileData"),
      ]),
    );
  });

  it("fails closed when a local module cannot be resolved", async () => {
    const root = await mkdtemp();
    await writeFile(join(root, "tsconfig.json"), "{}");
    await writeFile(join(root, "entry.ts"), 'import "./missing";\n');

    await expect(
      inspectImportBoundary({
        rootDir: root,
        tsconfigPath: join(root, "tsconfig.json"),
        roots: ["entry.ts"],
        forbiddenSegments,
      }),
    ).rejects.toMatchObject({
      code: "IMPORT_RESOLUTION_FAILED",
    });
  });

  it("walks every official production root and reports no forbidden transitive import", async () => {
    const report = await inspectImportBoundary({
      roots: await productionRoots(),
      forbiddenSegments,
    });
    expect(report.violations).toEqual([]);
    expect(report.visitedFiles).toEqual(
      expect.arrayContaining([
        join(process.cwd(), "app/research/[symbol]/page.tsx"),
        join(process.cwd(), "src/research/compositions/official.ts"),
      ]),
    );
  });

  it("keeps playback implementation graph payload-owned", async () => {
    const report = await inspectImportBoundary({
      roots: ["src/research/useResearchPlayback.ts"],
      forbiddenSegments: [
        "compositions/fixturePlayback",
        "officePlaybackCopy",
        "mockResearch",
      ],
    });
    expect(report.violations).toEqual([]);
    expect(report.visitedFiles).toContain(
      join(process.cwd(), "src/research/compositions/types.ts"),
    );
  });

  async function mkdtemp(): Promise<string> {
    const path = await makeTemporaryDirectory(
      join(tmpdir(), "stocksembly-boundary-"),
    );
    temporaryRoots.push(path);
    return path;
  }
});
