import { type RefObject, useEffect, useRef } from "react";

// Closes a menu when the pointer goes down outside every `insideRefs` element
// or when Escape is pressed. Listeners exist only while the menu is open, and
// callers may pass inline callbacks and arrays: the latest values are read
// from a ref, so they never re-subscribe the listeners.
export function useDismissableMenu(
  open: boolean,
  onDismiss: () => void,
  insideRefs: readonly RefObject<HTMLElement | null>[],
): void {
  const latest = useRef({ onDismiss, insideRefs });
  useEffect(() => {
    latest.current = { onDismiss, insideRefs };
  });
  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const inside = latest.current.insideRefs.some((ref) =>
        ref.current?.contains(target),
      );
      if (!inside) latest.current.onDismiss();
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current.onDismiss();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);
}
