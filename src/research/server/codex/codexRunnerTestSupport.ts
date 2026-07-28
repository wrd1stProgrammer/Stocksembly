import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CommittedLaunchReservation,
  LaunchReservationKey,
  LaunchReservationReader,
} from "./codexReservation";

export type CodexTempDirectory = {
  readonly path: string;
  readonly cleanup: () => Promise<void>;
};

export async function makeCodexTempDirectory(): Promise<CodexTempDirectory> {
  const path = await realpath(
    await mkdtemp(join(tmpdir(), "stocksembly-codex-test-")),
  );
  return {
    path,
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    },
  };
}

function reservationKey(key: LaunchReservationKey): string {
  return `${key.runId}:${key.jobId}:${key.attemptId}:${key.ordinal}`;
}

export class FakeLaunchReservationStore implements LaunchReservationReader {
  readonly #rows = new Map<string, CommittedLaunchReservation>();

  public commit(row: CommittedLaunchReservation): void {
    this.#rows.set(reservationKey(row), Object.freeze(row));
  }

  public readCommittedReservation(key: LaunchReservationKey): Promise<unknown> {
    return Promise.resolve(this.#rows.get(reservationKey(key)));
  }
}
