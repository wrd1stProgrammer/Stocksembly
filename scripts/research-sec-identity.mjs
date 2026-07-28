import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import typescript from "typescript";

const projectRoot = process.cwd();
const buildParent = join(projectRoot, ".stocksembly-verification");
const entryPath = resolve(
  projectRoot,
  "src/research/server/data/sec/secIdentityConfigCommand.ts",
);
let buildRoot;

try {
  await mkdir(buildParent, { recursive: true });
  buildRoot = await mkdtemp(join(buildParent, "sec-identity-cli-"));
  await writeFile(join(buildRoot, "package.json"), '{"type":"commonjs"}\n');
  const program = typescript.createProgram({
    rootNames: [entryPath],
    options: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.CommonJS,
      moduleResolution: typescript.ModuleResolutionKind.Node10,
      rootDir: projectRoot,
      outDir: buildRoot,
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noPropertyAccessFromIndexSignature: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmitOnError: true,
    },
  });
  const emitted = program.emit();
  const errors = typescript
    .getPreEmitDiagnostics(program)
    .concat(emitted.diagnostics)
    .filter(
      (diagnostic) =>
        diagnostic.category === typescript.DiagnosticCategory.Error,
    );
  if (errors.length > 0) throw new Error("SEC_IDENTITY_COMMAND_BUILD_FAILED");
  const outputPath = join(
    buildRoot,
    relative(projectRoot, entryPath).replace(/\.ts$/, ".js"),
  );
  const require = createRequire(import.meta.url);
  const commandModule = require(outputPath);
  if (typeof commandModule.runSecIdentityCommand !== "function")
    throw new Error("SEC_IDENTITY_COMMAND_BUILD_FAILED");
  process.exitCode = await commandModule.runSecIdentityCommand(process.argv[2]);
} catch {
  process.stderr.write("SEC_IDENTITY_COMMAND_FAILED\n");
  process.exitCode = 1;
} finally {
  if (buildRoot !== undefined)
    await rm(buildRoot, { recursive: true, force: true });
}
