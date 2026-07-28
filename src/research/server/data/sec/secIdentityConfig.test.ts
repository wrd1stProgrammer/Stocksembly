import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIGURE_SEC_IDENTITY_COMMAND,
  configureSecIdentity,
  requireSecIdentity,
  SecIdentityInputSchema,
} from "./secIdentityConfig";
import { configureSecIdentityInteractively } from "./secIdentityConfigCli";
import "./secIdentityConfig.command.testCases";

const SYNTHETIC_IDENTITY = {
  organization: "Synthetic Research Lab",
  contactEmail: "sec-test@example.invalid",
} as const;

const roots: string[] = [];

async function temporaryDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stocksembly-sec-identity-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("SEC fair-access identity configuration", () => {
  it("prompts for the exact schema and atomically writes a private config", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const prompts: string[] = [];
    const confirmations: string[] = [];
    const answers = [
      SYNTHETIC_IDENTITY.organization,
      SYNTHETIC_IDENTITY.contactEmail,
    ];

    // When
    const status = await configureSecIdentityInteractively({
      dataRoot,
      prompt: async (label) => {
        prompts.push(label);
        const answer = answers.shift();
        if (answer === undefined) throw new Error("test prompt exhausted");
        return answer;
      },
      confirm: async (derivedUserAgent) => {
        confirmations.push(derivedUserAgent);
        return true;
      },
    });

    // Then
    const configDirectory = join(dataRoot, "config");
    const configPath = join(configDirectory, "sec-identity.json");
    expect(prompts).toEqual(["Organization", "Monitored contact email"]);
    expect(confirmations).toEqual([
      "Stocksembly/1.0 (Synthetic Research Lab; sec-test@example.invalid)",
    ]);
    expect(status).toEqual({
      configured: true,
      identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await stat(configDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(configPath)).isSymbolicLink()).toBe(false);
    expect(await readdir(configDirectory)).toEqual(["sec-identity.json"]);
    expect(JSON.stringify(status)).not.toContain(
      SYNTHETIC_IDENTITY.organization,
    );
    expect(JSON.stringify(status)).not.toContain(
      SYNTHETIC_IDENTITY.contactEmail,
    );
  });

  it("parses trimmed organization and monitored contact fields at the boundary", () => {
    // Given
    const input = {
      organization: `  ${SYNTHETIC_IDENTITY.organization}  `,
      contactEmail: `  ${SYNTHETIC_IDENTITY.contactEmail}  `,
    };

    // When
    const parsed = SecIdentityInputSchema.parse(input);

    // Then
    expect(parsed).toEqual(SYNTHETIC_IDENTITY);
    expect(
      SecIdentityInputSchema.safeParse({
        organization: "x",
        contactEmail: "bad",
      }).success,
    ).toBe(false);
    expect(
      SecIdentityInputSchema.safeParse({
        organization: `Synthetic\nInjected`,
        contactEmail: SYNTHETIC_IDENTITY.contactEmail,
      }).success,
    ).toBe(false);
  });

  it("fails closed with a typed setup gate when configuration is absent", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();

    // When / Then
    await expect(requireSecIdentity(dataRoot)).rejects.toMatchObject({
      name: "SecIdentityConfigError",
      code: "SEC_IDENTITY_REQUIRED",
      setupCommand: CONFIGURE_SEC_IDENTITY_COMMAND,
    });
  });

  it.each([
    ["malformed JSON", "SEC_IDENTITY_MALFORMED", "{not-json", 0o600, 0o700],
    [
      "an insecure file mode",
      "SEC_IDENTITY_PERMISSIONS",
      JSON.stringify(SYNTHETIC_IDENTITY),
      0o644,
      0o700,
    ],
    [
      "an insecure directory mode",
      "SEC_IDENTITY_PERMISSIONS",
      JSON.stringify(SYNTHETIC_IDENTITY),
      0o600,
      0o755,
    ],
  ])(
    "rejects %s without disclosing config values",
    async (_label, code, body, fileMode, directoryMode) => {
      // Given
      const dataRoot = await temporaryDataRoot();
      const configDirectory = join(dataRoot, "config");
      const configPath = join(configDirectory, "sec-identity.json");
      await mkdir(configDirectory, { mode: directoryMode });
      await chmod(configDirectory, directoryMode);
      await writeFile(configPath, body, { mode: fileMode });
      await chmod(configPath, fileMode);

      // When / Then
      await expect(requireSecIdentity(dataRoot)).rejects.toMatchObject({
        name: "SecIdentityConfigError",
        code,
      });
    },
  );

  it("never follows a symlinked identity file", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const configDirectory = join(dataRoot, "config");
    const outsidePath = join(dataRoot, "outside.json");
    await mkdir(configDirectory, { mode: 0o700 });
    await writeFile(outsidePath, JSON.stringify(SYNTHETIC_IDENTITY), {
      mode: 0o600,
    });
    await symlink(outsidePath, join(configDirectory, "sec-identity.json"));

    // When / Then
    await expect(requireSecIdentity(dataRoot)).rejects.toMatchObject({
      name: "SecIdentityConfigError",
      code: "SEC_IDENTITY_SYMLINK",
    });
  });

  it("returns only configured state and a stable identity hash", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const configured = await configureSecIdentity(dataRoot, SYNTHETIC_IDENTITY);

    // When
    const required = await requireSecIdentity(dataRoot);

    // Then
    expect(required).toEqual(configured);
    expect(Object.keys(required).sort()).toEqual([
      "configured",
      "identityHash",
    ]);
  });
});
