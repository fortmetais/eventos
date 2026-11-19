import { useEffect, useRef, useState } from "react";

/** Shared index and scrolling only; each autocomplete retains its own selection rules. */
export function useSuggestionNavigation(open: boolean, optionCount: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (open && active >= 0)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function moveActive(direction: "next" | "previous") {
    if (!optionCount) return;
    setActive((current) =>
      direction === "next"
        ? Math.min(current + 1, optionCount - 1)
        : current < 0
          ? optionCount - 1
          : Math.max(current - 1, 0),
    );
  }
  return { listRef, active, setActive, moveActive };
}
