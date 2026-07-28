import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export class ImportBoundaryError extends Error {
  readonly name = "ImportBoundaryError";

  constructor(
    readonly code:
      | "IMPORT_BOUNDARY_CONFIG_FAILED"
      | "IMPORT_ROOT_READ_FAILED"
      | "IMPORT_RESOLUTION_FAILED"
      | "IMPORT_PATH_OUTSIDE_ROOT",
    message: string,
  ) {
    super(message);
  }
}

type AliasRule = readonly [string, readonly string[]];

type BoundaryConfig = {
  readonly rootDir: string;
  readonly aliases: readonly AliasRule[];
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function loadBoundaryConfig(
  rootDir: string,
  tsconfigPath: string,
): Promise<BoundaryConfig> {
  let raw: string;
  try {
    raw = await readFile(tsconfigPath, "utf8");
  } catch (error) {
    throw new ImportBoundaryError(
      "IMPORT_BOUNDARY_CONFIG_FAILED",
      `cannot read ${tsconfigPath}: ${String(error)}`,
    );
  }
  try {
    const parsed = JSON.parse(raw) as {
      compilerOptions?: { paths?: Record<string, readonly string[]> };
    };
    const paths = parsed.compilerOptions?.paths ?? {};
    return {
      rootDir,
      aliases: Object.entries(paths).sort(
        ([first], [second]) => second.length - first.length,
      ),
    };
  } catch (error) {
    throw new ImportBoundaryError(
      "IMPORT_BOUNDARY_CONFIG_FAILED",
      `cannot parse ${tsconfigPath}: ${String(error)}`,
    );
  }
}

function aliasCandidate(
  specifier: string,
  config: BoundaryConfig,
): readonly string[] | undefined {
  for (const [pattern, targets] of config.aliases) {
    const star = pattern.indexOf("*");
    if (star < 0 && specifier !== pattern) continue;
    if (star >= 0) {
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
        continue;
      }
      const wildcard = specifier.slice(
        prefix.length,
        specifier.length - suffix.length || undefined,
      );
      return targets.map((target) => target.replace("*", wildcard));
    }
    return targets;
  }
  return undefined;
}

async function fileCandidate(candidate: string): Promise<string | undefined> {
  for (const pathCandidate of [
    ...SOURCE_EXTENSIONS.map((extension) => `${candidate}${extension}`),
    candidate,
  ]) {
    try {
      const entry = await stat(pathCandidate);
      if (entry.isFile()) return resolve(pathCandidate);
      if (!entry.isDirectory()) continue;
      for (const extension of SOURCE_EXTENSIONS) {
        const indexPath = join(pathCandidate, `index${extension}`);
        try {
          const indexEntry = await stat(indexPath);
          if (indexEntry.isFile()) return resolve(indexPath);
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") continue;
          throw error;
        }
      }
      throw new ImportBoundaryError(
        "IMPORT_RESOLUTION_FAILED",
        `directory import has no source index: ${candidate}`,
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return undefined;
}

export async function resolveBoundaryImport(
  fromFile: string,
  specifier: string,
  config: BoundaryConfig,
): Promise<string | undefined> {
  const aliases = aliasCandidate(specifier, config);
  const local = specifier.startsWith(".") || isAbsolute(specifier) || aliases;
  if (!local) return undefined;
  const candidates = aliases
    ? aliases.map((candidate) => join(config.rootDir, candidate))
    : [isAbsolute(specifier) ? specifier : join(dirname(fromFile), specifier)];
  for (const candidate of candidates) {
    const resolved = await fileCandidate(candidate);
    if (!resolved) continue;
    const outsideRoot = relative(config.rootDir, resolved).startsWith("..");
    if (outsideRoot) {
      throw new ImportBoundaryError(
        "IMPORT_PATH_OUTSIDE_ROOT",
        `${fromFile} imports outside project root: ${specifier}`,
      );
    }
    return resolved;
  }
  throw new ImportBoundaryError(
    "IMPORT_RESOLUTION_FAILED",
    `${fromFile} cannot resolve local import ${specifier}`,
  );
}
