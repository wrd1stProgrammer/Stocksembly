import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CodexIsolationError } from "./readiness";
import { runProductionCodexReadinessProbe } from "./readinessProbe";

const EVIDENCE_DIRECTORY =
  ".omo/evidence/start-work/live-research-office/task-21" as const;
const EVIDENCE_NAME = "task-21-live-research-office.json" as const;

export async function runReadinessCommand(): Promise<number> {
  try {
    const report = await runProductionCodexReadinessProbe("worker_admission");
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(
      join(EVIDENCE_DIRECTORY, EVIDENCE_NAME),
      `${JSON.stringify(
        {
          scenarioCode: "LIVE_LINKED_PONG_NO_TOOL_SENTINEL",
          invocationHash:
            "a812117cfbda7ec61013b9485afaa10425206aeb2251dab241b3505a88a16cff",
          binaryObservable: "READY_EXIT_0",
          report,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600, flag: "w" },
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const failure =
      error instanceof CodexIsolationError
        ? error
        : new CodexIsolationError("probe");
    process.stderr.write(
      `${JSON.stringify({ status: "blocked", code: failure.code, check: failure.check, reason: failure.reason })}\n`,
    );
    return 1;
  }
}
