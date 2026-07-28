import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { moduleSpecifiers } from "./productionImportBoundaryParser";
import {
  ImportBoundaryError,
  loadBoundaryConfig,
  resolveBoundaryImport,
} from "./productionImportBoundaryResolver";

export { ImportBoundaryError } from "./productionImportBoundaryResolver";

import {
  type BoundaryScope,
  BUILTIN_RESTRICTED_INTERNAL_IMPORTS,
  builtInViolation,
  forbiddenMatch,
  type RestrictedInternalImport,
  restrictedImportViolation,
} from "./productionImportBoundaryRules";

function pushViolation(
  violations: string[],
  violation: string | undefined,
): void {
  if (violation) violations.push(violation);
}

export type ImportBoundaryOptions = {
  readonly rootDir?: string;
  readonly tsconfigPath?: string;
  readonly roots: readonly string[];
  readonly forbiddenSegments?: readonly string[];
  readonly scope?: BoundaryScope;
  readonly restrictedInternalImports?: readonly RestrictedInternalImport[];
};

export type ImportBoundaryReport = {
  readonly visitedFiles: readonly string[];
  readonly violations: readonly string[];
};

export async function inspectImportBoundary(
  options: ImportBoundaryOptions,
): Promise<ImportBoundaryReport> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const config = await loadBoundaryConfig(
    rootDir,
    resolve(options.tsconfigPath ?? join(rootDir, "tsconfig.json")),
  );
  const scope = options.scope ?? "official";
  const callerForbiddenSegments = options.forbiddenSegments ?? [];
  const restrictedInternalImports = [
    ...BUILTIN_RESTRICTED_INTERNAL_IMPORTS,
    ...(options.restrictedInternalImports ?? []),
  ];
  const queue: [string, string | undefined][] = options.roots.map((root) => [
    resolve(rootDir, root),
    undefined,
  ]);
  const visited = new Set<string>();
  const violations: string[] = [];
  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) continue;
    const [filePath, importedFrom] = entry;
    if (visited.has(filePath)) continue;
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch (error) {
      throw new ImportBoundaryError(
        "IMPORT_ROOT_READ_FAILED",
        `cannot read ${filePath}: ${String(error)}`,
      );
    }
    visited.add(filePath);
    const relativePath = relative(rootDir, filePath);
    const fileMatch = forbiddenMatch(relativePath, callerForbiddenSegments);
    if (fileMatch) violations.push(`${relativePath} -> ${fileMatch}`);
    const restrictedRootMatch = restrictedImportViolation(
      relativePath,
      importedFrom,
      restrictedInternalImports,
    );
    if (restrictedRootMatch) violations.push(restrictedRootMatch);
    pushViolation(
      violations,
      builtInViolation(relativePath, importedFrom, scope),
    );
    for (const specifier of moduleSpecifiers(filePath, source)) {
      const segment = forbiddenMatch(specifier, callerForbiddenSegments);
      if (segment) violations.push(`${relativePath} -> ${specifier}`);
      const resolved = await resolveBoundaryImport(filePath, specifier, config);
      if (!resolved) continue;
      const resolvedRelativePath = relative(rootDir, resolved);
      const resolvedSegment = forbiddenMatch(
        resolvedRelativePath,
        callerForbiddenSegments,
      );
      if (resolvedSegment) {
        violations.push(
          `${relativePath} imports ${resolvedRelativePath} -> ${resolvedSegment}`,
        );
      }
      const restrictedMatch = restrictedImportViolation(
        resolvedRelativePath,
        relativePath,
        restrictedInternalImports,
      );
      if (restrictedMatch)
        violations.push(`${relativePath} imports ${restrictedMatch}`);
      const builtInMatch = builtInViolation(
        resolvedRelativePath,
        relativePath,
        scope,
      );
      if (builtInMatch)
        violations.push(`${relativePath} imports ${builtInMatch}`);
      queue.push([resolved, relativePath]);
    }
  }
  return {
    visitedFiles: [...visited].sort(),
    violations: [...new Set(violations)].sort(),
  };
}
