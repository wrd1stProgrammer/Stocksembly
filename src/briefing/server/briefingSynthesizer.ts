import type { BriefingEditionPayload } from "../domain/contracts";
import {
  runBriefingSynthesis,
  type SynthesizeBriefingEditionInput,
} from "./briefingSynthesisOrchestrator";

export async function synthesizeBriefingEdition(
  input: SynthesizeBriefingEditionInput,
): Promise<BriefingEditionPayload> {
  return await runBriefingSynthesis(input);
}
