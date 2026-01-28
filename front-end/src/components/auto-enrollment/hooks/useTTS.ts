"use client";

import { useCallback, useRef } from "react";

/**
 * Text-to-speech helper that:
 * - respects enabled flag
 * - deduplicates by key to avoid repeat speaking
 * - cancels any in-progress speech before speaking the new text
 */
export function useTTS(enabled: boolean) {
  const lastKeyRef = useRef<string>("");

  return useCallback(
    (key: string, text: string) => {
      if (!enabled) return;
      if (!text) return;
      if (lastKeyRef.current === key) return;

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);

      // Calm / “system voice” vibe (kept exactly as original)
      u.rate = 0.98;
      u.pitch = 1.0;
      u.volume = 1.0;

      window.speechSynthesis.speak(u);
      lastKeyRef.current = key;
    },
    [enabled]
  );
}
