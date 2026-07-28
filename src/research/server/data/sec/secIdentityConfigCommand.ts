import { createInterface } from "node:readline";
import { z } from "zod";
import {
  requireSecIdentity,
  SecIdentityConfigError,
} from "./secIdentityConfig";
import { configureSecIdentityInteractively } from "./secIdentityConfigCli";

const SecIdentityCommandSchema = z.enum(["configure", "require"]);

export async function runSecIdentityCommand(
  commandInput: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const command = SecIdentityCommandSchema.safeParse(commandInput);
  const { STOCKSEMBLY_DATA_DIR: dataRootInput } = environment;
  const dataRoot = z.string().min(1).safeParse(dataRootInput);
  if (!command.success || !dataRoot.success) {
    process.stderr.write("SEC_IDENTITY_COMMAND_INVALID\n");
    return 1;
  }
  try {
    switch (command.data) {
      case "require": {
        const status = await requireSecIdentity(dataRoot.data);
        process.stdout.write(`${JSON.stringify(status)}\n`);
        return 0;
      }
      case "configure": {
        const lines = createInterface({
          input: process.stdin,
          crlfDelay: Infinity,
        });
        const iterator = lines[Symbol.asyncIterator]();
        const readLine = async (label: string): Promise<string> => {
          process.stdout.write(`${label}: `);
          const next = await iterator.next();
          if (next.done)
            throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
          return next.value;
        };
        try {
          const status = await configureSecIdentityInteractively({
            dataRoot: dataRoot.data,
            prompt: readLine,
            confirm: async (userAgent) => {
              process.stdout.write(`Derived SEC User-Agent: ${userAgent}\n`);
              const answer = await readLine("Confirm [y/N]");
              return /^(?:y|yes)$/i.test(answer.trim());
            },
          });
          process.stdout.write(`${JSON.stringify(status)}\n`);
          return 0;
        } finally {
          lines.close();
        }
      }
    }
  } catch (error) {
    if (error instanceof SecIdentityConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
