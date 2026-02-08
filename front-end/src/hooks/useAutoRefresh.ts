// src/hooks/useAutoRefresh.ts
import { useEffect, useRef } from "react";

export type UseAutoRefreshOpts = {
  onTick: () => void | Promise<void>;
  enabled?: boolean;
  intervalMs?: number;
  runOnMount?: boolean;
};

export function useAutoRefresh({
  onTick,
  enabled = true,
  intervalMs = 1500,
  runOnMount = true,
}: UseAutoRefreshOpts) {
  const onTickRef = useRef(onTick);
  const inFlightRef = useRef(false);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      // avoid unnecessary calls when tab is hidden
      if (document.visibilityState === "hidden") return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        await onTickRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    if (runOnMount) tick();

    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, runOnMount]);
}
