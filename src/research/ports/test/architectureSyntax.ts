import { posix } from "node:path";
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isClassDeclaration,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isNamedExports,
  isNamedImports,
  isNewExpression,
  isParameter,
  isPropertyAccessExpression,
  isStringLiteral,
  isTypeReferenceNode,
  isVariableDeclaration,
  type Node,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
} from "typescript";

type Reference = {
  readonly path: string;
  readonly name: string;
  readonly typeOnly: boolean;
};

type ParsedFile = {
  readonly imports: ReadonlyMap<string, Reference>;
  readonly exports: ReadonlyMap<string, Reference>;
  readonly directCalls: ReadonlySet<string>;
  readonly runReceivers: ReadonlySet<string>;
  readonly constructions: ReadonlySet<string>;
  readonly implementations: ReadonlySet<string>;
  readonly typedValues: ReadonlyMap<string, string>;
};

function resolveModule(
  sources: ReadonlyMap<string, string>,
  importer: string,
  specifier: string,
): string | undefined {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(importer), specifier))
      : undefined;
  if (base === undefined) return undefined;
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    posix.join(base, "index.ts"),
    posix.join(base, "index.tsx"),
  ].find((candidate) => sources.has(candidate));
}

function parseFile(
  path: string,
  source: string,
  sources: ReadonlyMap<string, string>,
): ParsedFile {
  const file = createSourceFile(
    path,
    source,
    ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );
  const imports = new Map<string, Reference>();
  const exports = new Map<string, Reference>();
  const directCalls = new Set<string>();
  const runReceivers = new Set<string>();
  const constructions = new Set<string>();
  const implementations = new Set<string>();
  const typedValues = new Map<string, string>();

  const recordTypedValue = (node: Node): void => {
    if (!isVariableDeclaration(node) && !isParameter(node)) return;
    if (
      !isIdentifier(node.name) ||
      !node.type ||
      !isTypeReferenceNode(node.type)
    )
      return;
    if (isIdentifier(node.type.typeName))
      typedValues.set(node.name.text, node.type.typeName.text);
  };

  const visit = (node: Node): void => {
    if (
      isImportDeclaration(node) &&
      isStringLiteral(node.moduleSpecifier) &&
      node.importClause
    ) {
      const resolved = resolveModule(sources, path, node.moduleSpecifier.text);
      const bindings = node.importClause.namedBindings;
      if (resolved && bindings && isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            path: resolved,
            name: element.propertyName?.text ?? element.name.text,
            typeOnly: node.importClause.isTypeOnly || element.isTypeOnly,
          });
        }
      }
    }
    if (
      isExportDeclaration(node) &&
      node.exportClause &&
      isNamedExports(node.exportClause) &&
      node.moduleSpecifier &&
      isStringLiteral(node.moduleSpecifier)
    ) {
      const resolved = resolveModule(sources, path, node.moduleSpecifier.text);
      if (resolved) {
        for (const element of node.exportClause.elements) {
          exports.set(element.name.text, {
            path: resolved,
            name: element.propertyName?.text ?? element.name.text,
            typeOnly: node.isTypeOnly || element.isTypeOnly,
          });
        }
      }
    }
    if (isCallExpression(node)) {
      if (isIdentifier(node.expression)) directCalls.add(node.expression.text);
      if (
        isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "run" &&
        isIdentifier(node.expression.expression)
      )
        runReceivers.add(node.expression.expression.text);
    }
    if (isNewExpression(node) && isIdentifier(node.expression))
      constructions.add(node.expression.text);
    if (isClassDeclaration(node)) {
      for (const heritage of node.heritageClauses ?? []) {
        if (heritage.token !== SyntaxKind.ImplementsKeyword) continue;
        for (const type of heritage.types)
          if (isIdentifier(type.expression))
            implementations.add(type.expression.text);
      }
    }
    recordTypedValue(node);
    forEachChild(node, visit);
  };
  visit(file);
  return {
    imports,
    exports,
    directCalls,
    runReceivers,
    constructions,
    implementations,
    typedValues,
  };
}

function resolveExport(
  parsed: ReadonlyMap<string, ParsedFile>,
  reference: Reference,
  seen: ReadonlySet<string> = new Set(),
): Reference {
  const key = `${reference.path}:${reference.name}`;
  if (seen.has(key)) return reference;
  const next = parsed.get(reference.path)?.exports.get(reference.name);
  if (!next) return reference;
  return resolveExport(parsed, next, new Set([...seen, key]));
}

function originForLocal(
  parsed: ReadonlyMap<string, ParsedFile>,
  path: string,
  localName: string,
): Reference | undefined {
  const reference = parsed.get(path)?.imports.get(localName);
  return reference ? resolveExport(parsed, reference) : undefined;
}

function isTransitionOrigin(reference: Reference | undefined): boolean {
  return (
    reference !== undefined &&
    /\/domain\/(?:runStateTransitions|jobStateTransitions)\.[cm]?[jt]sx?$/.test(
      reference.path,
    )
  );
}

function isCodexOrigin(reference: Reference | undefined): boolean {
  return (
    reference !== undefined &&
    /\/ports\/runtime\.[cm]?[jt]sx?$/.test(reference.path)
  );
}

export function inspectArchitectureSyntax(
  sources: ReadonlyMap<string, string>,
  officialFiles: ReadonlySet<string>,
): readonly string[] {
  const parsed = new Map(
    [...sources].map(([path, source]) => [
      path,
      parseFile(path, source, sources),
    ]),
  );
  const violations: string[] = [];
  for (const [path, file] of parsed) {
    if (/(?:\/adapters\/|\/server\/)/.test(`/${path}`)) {
      for (const call of file.directCalls) {
        if (isTransitionOrigin(originForLocal(parsed, path, call)))
          violations.push(`ADAPTER_WORKFLOW_TRANSITION:${path}`);
      }
    }
    if (!path.startsWith("src/research/worker/")) {
      const runtimeCall = [...file.directCalls, ...file.runReceivers].some(
        (name) => {
          const typed = file.typedValues.get(name);
          return isCodexOrigin(originForLocal(parsed, path, typed ?? name));
        },
      );
      const implementation = [...file.implementations].some((name) =>
        isCodexOrigin(originForLocal(parsed, path, name)),
      );
      if (runtimeCall || implementation)
        violations.push(`CODEX_CALLER_OUTSIDE_WORKER:${path}`);
    }
    if (officialFiles.has(path)) {
      for (const construction of file.constructions) {
        const origin = originForLocal(parsed, path, construction);
        if (origin && /(?:\/test\/|fixture|inMemory)/i.test(origin.path))
          violations.push(`OFFICIAL_TEST_FAKE_CONSTRUCTION:${path}`);
      }
    }
  }
  return [...new Set(violations)].sort();
}
