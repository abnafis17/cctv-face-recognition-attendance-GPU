"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseMjpegStreamArgs = {
  /** fully qualified mjpeg base url (without cache-busting param) */
  streamUrl: string;
  /** enable stream management (e.g. only when enrolling screen is visible) */
  enabled: boolean;
};

export function useMjpegStream({ streamUrl, enabled }: UseMjpegStreamArgs) {
  // MJPEG stream reliability: cache-bust + retry (some browsers keep stale connections)
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [streamHasFrame, setStreamHasFrame] = useState(false);
  const [streamRetries, setStreamRetries] = useState(0);

  const streamRetryCountRef = useRef(0);
  const streamRetryTimerRef = useRef<number | null>(null);

  const streamSrc = useMemo(() => {
    if (!enabled) return "";
    if (!streamUrl) return "";
    const sep = streamUrl.includes("?") ? "&" : "?";
    return `${streamUrl}${sep}t=${streamAttempt}`;
  }, [enabled, streamAttempt, streamUrl]);

  const resetStream = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;
    streamRetryCountRef.current = 0;

    setStreamRetries(0);
    setStreamHasFrame(false);
    setStreamAttempt((a) => a + 1);
  }, []);

  const scheduleStreamRetry = useCallback(() => {
    streamRetryCountRef.current += 1;
    const tries = streamRetryCountRef.current;

    setStreamRetries(tries);
    setStreamHasFrame(false);

    const delay = Math.min(3000, 250 * 2 ** Math.min(tries, 4));
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);

    streamRetryTimerRef.current = window.setTimeout(() => {
      setStreamAttempt((a) => a + 1);
    }, delay);
  }, []);

  const forceStreamReloadNow = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;

    streamRetryCountRef.current += 1;
    const tries = streamRetryCountRef.current;

    setStreamRetries(tries);
    setStreamHasFrame(false);
    setStreamAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    };
  }, []);

  // Watchdog: if MJPEG hangs without firing onError, force-reload until a frame appears.
  useEffect(() => {
    if (!enabled) return;
    if (!streamSrc) return;
    if (streamHasFrame) return;

    const t = window.setTimeout(() => {
      forceStreamReloadNow();
    }, 3500);

    return () => window.clearTimeout(t);
  }, [enabled, forceStreamReloadNow, streamHasFrame, streamSrc]);

  const onFrame = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;

    streamRetryCountRef.current = 0;
    setStreamRetries(0);
    setStreamHasFrame(true);
  }, []);

  const imgKey = useMemo(() => `${streamUrl}:${streamAttempt}`, [streamAttempt, streamUrl]);

  return {
    streamAttempt,
    streamSrc,
    streamHasFrame,
    streamRetries,
    imgKey,
    onFrame,
    onError: scheduleStreamRetry,
    resetStream,
  };
}
