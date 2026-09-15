import { afterEach, expect, it, vi } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import { collectionSignal } from "../server/data/sharedSourceCache";
import { waitForStockPreparation } from "../server/persistence/postgres/stockPreparation";
import { createStockPreparationWorker } from "./stockPreparationWorker";

const collector = vi.hoisted(() => vi.fn());
vi.mock("./initialCollectionData", () => ({
  collectInitialEvidence: collector,
}));
afterEach(() => collector.mockReset());

it("joins one background collection across workers without creating a research run", async () => {
  const fixture = await createResearchTestDatabase();
  const first = createStockPreparationWorker(
    fixture.pool,
    "/tmp/unused-prefetch-test",
  );
  const second = createStockPreparationWorker(
    fixture.pool,
    "/tmp/unused-prefetch-test",
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  collector.mockImplementation(async () => {
    await gate;
  });
  try {
    await fixture.pool.query(
      "INSERT INTO stock_preparations(symbol) VALUES('NVDA')",
    );
    first.tick();
    await vi.waitFor(() => expect(collector).toHaveBeenCalledTimes(1));
    second.tick();
    const waiting = vi.fn(async () => {});
    const joined = waitForStockPreparation({
      database: fixture.pool,
      symbol: "NVDA",
      signal: AbortSignal.timeout(5000),
      activity: () => {},
      onWaiting: waiting,
      pollMs: 10,
    });
    await vi.waitFor(() => expect(waiting).toHaveBeenCalledTimes(1));
    release();
    expect(await joined).toBe("ready");
    expect(collector).toHaveBeenCalledTimes(1);
    expect((await fixture.pool.query("SELECT run_id FROM runs")).rowCount).toBe(
      0,
    );
  } finally {
    release();
    await first.close();
    await second.close();
    await fixture.close();
  }
});

it("cancels collection on shutdown and leaves a bounded retry", async () => {
  const fixture = await createResearchTestDatabase();
  const worker = createStockPreparationWorker(
    fixture.pool,
    "/tmp/unused-prefetch-test",
  );
  collector.mockImplementation(async () => {
    const signal = collectionSignal();
    if (!signal) throw new Error("Missing collection cancellation");
    await new Promise<void>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });
  try {
    await fixture.pool.query(
      "INSERT INTO stock_preparations(symbol) VALUES('NVDA')",
    );
    worker.tick();
    await vi.waitFor(() => expect(collector).toHaveBeenCalledTimes(1));
    await worker.close();
    expect(
      (
        await fixture.pool.query(
          "SELECT status,attempts FROM stock_preparations",
        )
      ).rows,
    ).toEqual([{ status: "queued", attempts: 1 }]);
  } finally {
    await worker.close();
    await fixture.close();
  }
});
