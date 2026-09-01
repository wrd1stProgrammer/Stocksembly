import { useMediaQuery } from "./useMediaQuery";

const MOBILE_INPUT_QUERY = "(max-width: 768px)";

// Native inputs replace the animated caret field on phone-sized screens.
export function useMobileInputMode(): boolean {
  return useMediaQuery(MOBILE_INPUT_QUERY);
}
