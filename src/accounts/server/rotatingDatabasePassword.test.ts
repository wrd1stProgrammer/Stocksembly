import { describe, expect, it, vi } from "vitest";
import { rotatingDatabasePassword } from "./rotatingDatabasePassword";

describe("rotatingDatabasePassword", () => {
  it("loads the current password for every new database connection", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("rotated-once")
      .mockResolvedValueOnce("rotated-twice");
    const password = rotatingDatabasePassword("initial", load);

    await expect(password()).resolves.toBe("rotated-once");
    await expect(password()).resolves.toBe("rotated-twice");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("uses the last verified password during a temporary secret read failure", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("current")
      .mockRejectedValueOnce(new Error("temporary outage"));
    const password = rotatingDatabasePassword("initial", load);

    await expect(password()).resolves.toBe("current");
    await expect(password()).resolves.toBe("current");
  });
});
