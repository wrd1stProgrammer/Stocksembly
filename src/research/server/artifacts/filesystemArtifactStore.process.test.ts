import { describe, expect, it } from "vitest";
import {
  createFilesystemArtifactStore,
  resolveStocksemblyDataDirectory,
} from "./filesystemArtifactStore";
import {
  MemoryArtifactMetadata,
  makeArtifactWrite,
} from "./filesystemArtifactStore.contract.fixtures";

describe("filesystem artifact CAS process probe", () => {
  it("commits a shared payload when launched as a contract child", async () => {
    const { STOCKSEMBLY_CAS_PROCESS_ROOT: processRoot } = process.env;
    if (processRoot === undefined) {
      expect(processRoot).toBeUndefined();
      return;
    }
    const metadata = new MemoryArtifactMetadata();
    const store = createFilesystemArtifactStore({
      dataDirectory: resolveStocksemblyDataDirectory({
        STOCKSEMBLY_DATA_DIR: processRoot,
      }),
      maxBlobBytes: 1024,
      metadata,
    });
    const descriptor = await store.put(makeArtifactWrite("process payload"));
    expect((await store.get(descriptor.digest))?.bytes.byteLength).toBe(15);
  });
});
