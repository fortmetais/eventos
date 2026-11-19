import { useEffect, useRef, type RefObject } from "react";
/** Dismiss a disclosure regardless of whether a browser focuses buttons after a pointer click. */
export function useDisclosureDismiss(
  open: boolean,
  onClose: () => void,
  trigger: RefObject<HTMLElement | null>,
  container: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close.current();
      trigger.current?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close.current();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, trigger, container]);
}
