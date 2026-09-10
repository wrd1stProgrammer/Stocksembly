import { AsyncLocalStorage } from "node:async_hooks";
import type { ResearchExecutionBackend } from "../../domain/researchExecution";

export const codexExecutionContext =
  new AsyncLocalStorage<ResearchExecutionBackend>();
