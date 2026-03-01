import { useCallback, useSyncExternalStore, type RefObject } from "react";

function noop() { /* no element to observe */ }

export function useContainerWidth(ref: RefObject<HTMLDivElement | null>, padding: number): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const el = ref.current;
      if (!el) return noop;
      const ro = new ResizeObserver(onStoreChange);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [ref],
  );

  const getSnapshot = useCallback(() => {
    const el = ref.current;
    return el ? Math.floor(el.getBoundingClientRect().width) - padding : 0;
  }, [ref, padding]);

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
