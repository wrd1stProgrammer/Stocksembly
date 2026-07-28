import { resolve } from "node:path";

const activeFills = new Map<string, Promise<void>>();

function fillKey(dataRoot: string, namespace: string, key: string): string {
  return `${resolve(dataRoot)}\0${namespace}\0${key}`;
}

export async function withCacheFillLock<T>(input: {
  readonly dataRoot: string;
  readonly namespace: string;
  readonly key: string;
  readonly operation: () => Promise<T>;
}): Promise<T> {
  const key = fillKey(input.dataRoot, input.namespace, input.key);
  while (true) {
    const active = activeFills.get(key);
    if (active !== undefined) {
      await active;
      continue;
    }

    let release: () => void = () => undefined;
    const lease = new Promise<void>((resolveLease) => {
      release = resolveLease;
    });
    activeFills.set(key, lease);
    try {
      return await input.operation();
    } finally {
      if (activeFills.get(key) === lease) activeFills.delete(key);
      release();
    }
  }
}
