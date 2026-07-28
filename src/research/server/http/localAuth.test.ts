import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureLocalAuth, rotateLocalAuth } from "./localAuth";
import { LocalAuthFileError } from "./localAuthFiles";

function cookieHeader(setCookie: string): string {
  const separator = setCookie.indexOf(";");
  return separator === -1 ? setCookie : setCookie.slice(0, separator);
}

describe("local HTTP authentication", () => {
  it("creates private 256-bit credentials on first boot and preserves them across restart", async () => {
    // Given
    const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-local-auth-"));

    // When
    const firstBoot = await ensureLocalAuth(dataRoot);
    const restarted = await ensureLocalAuth(dataRoot);

    // Then
    expect(restarted.epoch).toBe(firstBoot.epoch);
    expect(restarted.principal.id).toBe(firstBoot.principal.id);
    expect(await readFile(firstBoot.automationTokenPath, "utf8")).toHaveLength(
      43,
    );
    expect((await stat(join(dataRoot, "local-auth"))).mode & 0o777).toBe(0o700);
    expect((await stat(firstBoot.automationTokenPath)).mode & 0o777).toBe(
      0o600,
    );
    expect(
      (await stat(join(dataRoot, "local-auth", "session-secret"))).mode & 0o777,
    ).toBe(0o600);
  });

  it("converges concurrent first boots on one atomic credential set", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-race-"),
    );

    // When
    const boots = await Promise.all(
      Array.from({ length: 8 }, () => ensureLocalAuth(dataRoot)),
    );

    // Then
    expect(new Set(boots.map(({ epoch }) => epoch))).toHaveLength(1);
    expect(
      new Set(
        await Promise.all(
          boots.map(({ automationTokenPath }) =>
            readFile(automationTokenPath, "utf8"),
          ),
        ),
      ),
    ).toHaveLength(1);
  });

  it("authenticates only the server-owned principal by signed cookie or token-file bearer", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-principal-"),
    );
    const auth = await ensureLocalAuth(dataRoot);
    const token = await readFile(auth.automationTokenPath, "utf8");

    // When
    const cookieResult = auth.authenticate(
      new Request("http://localhost/api/research/runs", {
        headers: {
          cookie: cookieHeader(auth.createBootstrapCookie()),
          "x-principal": "attacker",
        },
      }),
    );
    const bearerResult = auth.authenticate(
      new Request("http://localhost/api/research/runs", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    // Then
    expect(cookieResult).toEqual({
      kind: "authenticated",
      principal: auth.principal,
      via: "cookie",
    });
    expect(bearerResult).toEqual({
      kind: "authenticated",
      principal: auth.principal,
      via: "bearer",
    });
  });

  it("rejects invalid cookie and bearer values regardless of candidate length", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-invalid-"),
    );
    const auth = await ensureLocalAuth(dataRoot);

    // When
    const results = [
      auth.authenticate(
        new Request("http://localhost", {
          headers: { authorization: "Bearer invalid" },
        }),
      ),
      auth.authenticate(
        new Request("http://localhost", {
          headers: { cookie: "stocksembly_local_session=x".repeat(4) },
        }),
      ),
    ];

    // Then
    expect(results).toEqual([
      { kind: "unauthorized" },
      { kind: "unauthorized" },
    ]);
  });

  it("rejects stale credentials after explicit rotation and accepts rebootstrap credentials", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-rotation-"),
    );
    const original = await ensureLocalAuth(dataRoot);
    const staleCookie = cookieHeader(original.createBootstrapCookie());
    const staleToken = await readFile(original.automationTokenPath, "utf8");

    // When
    const rotated = await rotateLocalAuth(dataRoot);
    const rotatedToken = await readFile(rotated.automationTokenPath, "utf8");

    // Then
    expect(rotated.epoch).not.toBe(original.epoch);
    expect(rotated.principal.id).not.toBe(original.principal.id);
    expect(rotated.principal.id).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      rotated.authenticate(
        new Request("http://localhost", { headers: { cookie: staleCookie } }),
      ),
    ).toEqual({ kind: "unauthorized" });
    expect(
      rotated.authenticate(
        new Request("http://localhost", {
          headers: { authorization: `Bearer ${staleToken}` },
        }),
      ),
    ).toEqual({ kind: "unauthorized" });
    expect(
      rotated.authenticate(
        new Request("http://localhost", {
          headers: { cookie: cookieHeader(rotated.createBootstrapCookie()) },
        }),
      ).kind,
    ).toBe("authenticated");
    expect(
      rotated.authenticate(
        new Request("http://localhost", {
          headers: { authorization: `Bearer ${rotatedToken}` },
        }),
      ).kind,
    ).toBe("authenticated");
  });

  it.each([
    [
      "malformed content",
      async (dataRoot: string) =>
        writeFile(
          join(dataRoot, "local-auth", "automation-token"),
          "attacker",
          "utf8",
        ),
    ],
    [
      "unsafe permissions",
      async (dataRoot: string) =>
        chmod(join(dataRoot, "local-auth", "automation-token"), 0o644),
    ],
  ] as const)("fails closed on %s", async (_case, tamper) => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-tamper-"),
    );
    await ensureLocalAuth(dataRoot);
    await tamper(dataRoot);

    // When
    const restart = ensureLocalAuth(dataRoot);

    // Then
    await expect(restart).rejects.toBeInstanceOf(LocalAuthFileError);
  });

  it("rejects a symlink credential without following it", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-local-auth-link-"),
    );
    const authDirectory = join(dataRoot, "local-auth");
    const target = join(dataRoot, "attacker-token");
    await mkdir(authDirectory, { mode: 0o700 });
    await writeFile(target, "A".repeat(43), { mode: 0o600 });
    await symlink(target, join(authDirectory, "automation-token"));

    // When
    const boot = ensureLocalAuth(dataRoot);

    // Then
    await expect(boot).rejects.toMatchObject({
      name: "LocalAuthFileError",
      reason: "unsafe_path",
      message: "Local authentication storage is invalid",
    });
    await expect(boot).rejects.not.toHaveProperty("path");
  });
});
