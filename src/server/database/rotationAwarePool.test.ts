import { Client, Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RotationAwarePool } from "./rotationAwarePool";

const authError = () =>
  Object.assign(new Error("authentication failed"), { code: "28P01" });
const client = () => Object.assign(new Client(), { release: vi.fn() });
const pool = () => new RotationAwarePool({ password: async () => "latest" });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("rotation-aware connection acquisition", () => {
  it("survives a 32 second rotation window before acquiring a client", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const connected = client();
    const connect = vi
      .spyOn(Pool.prototype, "connect")
      .mockImplementation(async () => {
        if (Date.now() - start < 32_000) throw authError();
        return connected;
      });
    const result = pool().connect();
    await vi.advanceTimersByTimeAsync(37_000);
    expect(await result).toBe(connected);
    expect(connect).toHaveBeenCalledTimes(9);
  });

  it("bounds persistent credential failures", async () => {
    vi.useFakeTimers();
    vi.spyOn(Pool.prototype, "connect").mockRejectedValue(authError());
    const result = expect(pool().connect()).rejects.toMatchObject({
      code: "28P01",
    });
    await vi.advanceTimersByTimeAsync(40_000);
    await result;
  });

  it("does not retry static passwords or other connection errors", async () => {
    const connect = vi
      .spyOn(Pool.prototype, "connect")
      .mockRejectedValue(authError());
    await expect(
      new RotationAwarePool({ password: "fixed" }).connect(),
    ).rejects.toThrow();
    connect.mockRejectedValueOnce(
      Object.assign(new Error("network"), { code: "ECONNREFUSED" }),
    );
    await expect(pool().connect()).rejects.toThrow("network");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("preserves callback acquisition and release", async () => {
    vi.useFakeTimers();
    const connected = client();
    vi.spyOn(Pool.prototype, "connect")
      .mockRejectedValueOnce(authError())
      .mockImplementationOnce(async () => connected);
    const callback = vi.fn();
    pool().connect(callback);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      undefined,
      connected,
      connected.release,
    );
  });

  it("does not replay SQL, even when a query itself reports an authentication code", async () => {
    const connected = client();
    vi.spyOn(Pool.prototype, "connect").mockImplementation(
      async () => connected,
    );
    const query = vi.spyOn(connected, "query").mockImplementation(() => {
      throw authError();
    });
    await expect(
      pool().query("INSERT INTO payments VALUES (1)"),
    ).rejects.toMatchObject({ code: "28P01" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when the pool is shut down", async () => {
    vi.useFakeTimers();
    const connect = vi
      .spyOn(Pool.prototype, "connect")
      .mockRejectedValue(authError());
    const database = pool();
    const result = expect(database.connect()).rejects.toThrow(
      "authentication failed",
    );
    await vi.advanceTimersByTimeAsync(100);
    await database.end();
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
