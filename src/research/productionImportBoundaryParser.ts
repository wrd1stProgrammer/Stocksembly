import { extname } from "node:path";
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isStringLiteral,
  type Node,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
} from "typescript";

function scriptKindFor(filePath: string): ScriptKind {
  return extname(filePath) === ".tsx" ? ScriptKind.TSX : ScriptKind.TS;
}

export function moduleSpecifiers(
  filePath: string,
  source: string,
): readonly string[] {
  const file = createSourceFile(
    filePath,
    source,
    ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const imports: string[] = [];
  const visit = (node: Node): void => {
    if (
      (isImportDeclaration(node) || isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (isCallExpression(node)) {
      const [argument] = node.arguments;
      const isDynamicImport = node.expression.kind === SyntaxKind.ImportKeyword;
      const isRequire =
        isIdentifier(node.expression) && node.expression.text === "require";
      if (
        (isDynamicImport || isRequire) &&
        argument &&
        isStringLiteral(argument)
      ) {
        imports.push(argument.text);
      }
    }
    forEachChild(node, visit);
  };
  visit(file);
  return imports;
}
