import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

class VerificationError extends Error {}

function options(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--"))
      throw new VerificationError(`unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new VerificationError(`${key} requires a value`);
    const existing = values.get(key) ?? [];
    values.set(key, [...existing, value]);
    index += 1;
  }
  return values;
}

function required(args, name) {
  const value = args.get(name)?.[0];
  if (value === undefined) throw new VerificationError(`${name} is required`);
  return value;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function expandFiles(root, relativePath) {
  const absolute = path.join(root, relativePath);
  const metadata = await lstat(absolute).catch(() => undefined);
  if (metadata === undefined)
    return [{ path: relativePath, type: "missing", sha256: "missing" }];
  if (metadata.isDirectory()) {
    const children = await readdir(absolute);
    const nested = await Promise.all(
      children
        .sort()
        .map((child) => expandFiles(root, path.join(relativePath, child))),
    );
    return nested.flat();
  }
  if (metadata.isSymbolicLink()) {
    return [
      {
        path: relativePath,
        type: "symlink",
        sha256: digest(await readlink(absolute)),
      },
    ];
  }
  return [
    {
      path: relativePath,
      type: "file",
      sha256: digest(await readFile(absolute)),
    },
  ];
}

async function captureOriginal(root) {
  const status = execFileSync("git", [
    "-C",
    root,
    "status",
    "--porcelain=v1",
    "-z",
  ]);
  const entries = status.toString("utf8").split("\0").filter(Boolean);
  const paths = entries.map((entry) => entry.slice(3).replace(/\/$/u, ""));
  const records = (
    await Promise.all(paths.map((entry) => expandFiles(root, entry)))
  )
    .flat()
    .sort((left, right) => left.path.localeCompare(right.path));
  const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  return { status, manifest: { root, head, records } };
}

function globPattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `^${escaped.replaceAll("**", "@@").replaceAll("*", "[^/]*").replaceAll("@@", ".*")}$`,
    "u",
  );
}

async function verifyOriginal(evidence, originalRoot) {
  const beforeStatus = await readFile(
    path.join(evidence, "original-checkout-before.status.z"),
  );
  const beforeManifest = JSON.parse(
    await readFile(
      path.join(evidence, "original-checkout-before.sha256.json"),
      "utf8",
    ),
  );
  const after = await captureOriginal(originalRoot);
  await writeFile(
    path.join(evidence, "original-checkout-after.status.z"),
    after.status,
  );
  await writeFile(
    path.join(evidence, "original-checkout-after.sha256.json"),
    `${JSON.stringify(after.manifest, null, 2)}\n`,
  );
  if (
    !beforeStatus.equals(after.status) ||
    JSON.stringify(beforeManifest) !== JSON.stringify(after.manifest)
  )
    throw new VerificationError("original checkout changed");
}

async function verifyExecutionState(evidence, requiredTasks, requireComplete) {
  const manifest = JSON.parse(
    await readFile(
      path.join(evidence, "execution-evidence-manifest.json"),
      "utf8",
    ),
  );
  const finalStatus = JSON.parse(
    await readFile(path.join(evidence, "final-status.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.slug !== "research-quality-pipeline-hardening" ||
    !Array.isArray(manifest.tasks)
  )
    throw new VerificationError("execution evidence manifest is invalid");
  for (const taskNumber of requiredTasks) {
    const task = manifest.tasks.find((entry) => entry.task === taskNumber);
    if (
      task?.status !== "complete" ||
      !Array.isArray(task.commandExitCodes) ||
      task.commandExitCodes.some((code) => code !== 0)
    )
      throw new VerificationError(
        `task ${taskNumber} execution status is incomplete`,
      );
    if (!Array.isArray(task.artifacts) || task.artifacts.length === 0)
      throw new VerificationError(
        `task ${taskNumber} evidence artifacts are missing`,
      );
    for (const artifact of task.artifacts) {
      const bytes = await readFile(path.join(evidence, artifact));
      if (bytes.byteLength === 0)
        throw new VerificationError(`empty evidence artifact: ${artifact}`);
    }
  }
  if (
    finalStatus.schemaVersion !== 1 ||
    finalStatus.slug !== manifest.slug ||
    !Array.isArray(finalStatus.completedTasks) ||
    requiredTasks.some((task) => !finalStatus.completedTasks.includes(task)) ||
    (requireComplete && finalStatus.status !== "complete")
  )
    throw new VerificationError("final status is invalid or incomplete");
}

async function verifyTask(args) {
  const task = required(args, "--task");
  const evidence = path.resolve(required(args, "--evidence"));
  if (task !== "10") throw new VerificationError(`unsupported task: ${task}`);
  const base = path.join(
    evidence,
    "task-10-research-quality-pipeline-hardening",
  );
  const report = JSON.parse(await readFile(`${base}.json`, "utf8"));
  const markdown = await readFile(`${base}.md`, "utf8");
  if (report.passed !== true || report.reports?.length !== 5)
    throw new VerificationError("Task 10 green report is incomplete");
  if (
    report.reports.some(
      (entry) =>
        entry.fatalReasons.length !== 0 ||
        entry.totalScore < 8 ||
        entry.expectationsMatch !== true,
    )
  )
    throw new VerificationError("Task 10 green acceptance failed");
  if (!markdown.includes("Predicate outcomes and component points"))
    throw new VerificationError("Task 10 Markdown details missing");
  await verifyExecutionState(evidence, [10], false);
  await verifyOriginal(
    evidence,
    path.resolve(required(args, "--original-checkout")),
  );
  return {
    mode: "task",
    task: 10,
    passed: true,
    fixtureCount: 5,
    originalCheckoutUnchanged: true,
  };
}

async function verifyScope(args) {
  const base = required(args, "--base");
  const evidence = path.resolve(required(args, "--evidence"));
  const allowed = (args.get("--allow") ?? []).map(globPattern);
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const outside = changed.filter(
    (entry) => !allowed.some((pattern) => pattern.test(entry)),
  );
  if (outside.length > 0)
    throw new VerificationError(
      `paths outside allowlist: ${outside.join(", ")}`,
    );
  await verifyOriginal(
    evidence,
    path.resolve(required(args, "--original-checkout")),
  );
  return { mode: "scope", passed: true, changedPaths: changed };
}

async function verifyFinal(args) {
  const evidence = path.resolve(required(args, "--evidence"));
  const plan = await readFile(path.resolve(required(args, "--plan")));
  const review = JSON.parse(
    await readFile(
      path.resolve(required(args, "--approved-plan-review")),
      "utf8",
    ),
  );
  const binding = JSON.parse(
    await readFile(path.resolve(required(args, "--plan-binding")), "utf8"),
  );
  if (
    digest(plan) !== review.approvedPlanSha256 ||
    plan.byteLength !== review.approvedPlanBytes
  )
    throw new VerificationError("approved plan hash or byte length mismatch");
  if (
    binding.approvedPlanSha256 !== review.approvedPlanSha256 ||
    binding.approvedBaseCommit !== review.approvedBaseCommit
  )
    throw new VerificationError("plan binding mismatch");
  await verifyExecutionState(
    evidence,
    Array.from({ length: 12 }, (_, index) => index + 1),
    true,
  );
  for (let task = 1; task <= 12; task += 1) {
    const prefix = path.join(
      evidence,
      `task-${task}-research-quality-pipeline-hardening`,
    );
    const present = await readFile(`${prefix}.txt`)
      .then(() => true)
      .catch(() =>
        readFile(`${prefix}.json`)
          .then(() => true)
          .catch(() => false),
      );
    if (!present) throw new VerificationError(`task ${task} evidence missing`);
  }
  return { mode: "final", passed: true, taskEvidenceCount: 12 };
}

const args = options(process.argv.slice(2));
const mode = required(args, "--mode");
const result =
  mode === "task"
    ? await verifyTask(args)
    : mode === "scope"
      ? await verifyScope(args)
      : mode === "final"
        ? await verifyFinal(args)
        : undefined;
if (result === undefined)
  throw new VerificationError(`unsupported mode: ${mode}`);
const evidence = path.resolve(required(args, "--evidence"));
await mkdir(evidence, { recursive: true });
await writeFile(
  path.join(evidence, `verification-${mode}.json`),
  `${JSON.stringify(result, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
