"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type UseMjpegStreamArgs = {
  /** Fully qualified MJPEG base url (without cache-busting param). */
  streamUrl: string;
  /** Enable stream management (e.g. only when the view is visible). */
  enabled: boolean;
  /**
   * Optional periodic refresh to recover from MJPEG connections that silently stall
   * (some browsers won't fire `onError` after a server restart/network hiccup).
   */
  refreshIntervalMs?: number;
  /**
   * Optional watchdog for streams that become stale after first frame
   * (e.g. black/frozen tiles without an `onError` event).
   */
  staleAfterMs?: number;
};

export function useMjpegStream({
  streamUrl,
  enabled,
  refreshIntervalMs,
  staleAfterMs,
}: UseMjpegStreamArgs) {
  // MJPEG stream reliability: cache-bust + retry (some browsers keep stale connections)
  // Note: Next.js can preserve client component state across navigations. We therefore
  // include a per-hook-instance nonce in the cache-buster to guarantee a fresh request
  // whenever the component is (re)mounted.
  const mountNonce = useId();
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [streamHasFrame, setStreamHasFrame] = useState(false);
  const [streamRetries, setStreamRetries] = useState(0);

  const streamRetryCountRef = useRef(0);
  const streamRetryTimerRef = useRef<number | null>(null);
  const streamHasFrameRef = useRef(false);
  const lastFrameAtRef = useRef(0);

  useEffect(() => {
    streamHasFrameRef.current = streamHasFrame;
  }, [streamHasFrame]);

  const streamSrc = useMemo(() => {
    if (!enabled) return "";
    if (!streamUrl) return "";
    const sep = streamUrl.includes("?") ? "&" : "?";
    return `${streamUrl}${sep}t=${encodeURIComponent(mountNonce)}-${streamAttempt}`;
  }, [enabled, mountNonce, streamAttempt, streamUrl]);

  const resetStream = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;
    streamRetryCountRef.current = 0;
    lastFrameAtRef.current = 0;

    setStreamRetries(0);
    setStreamHasFrame(false);
    setStreamAttempt((a) => a + 1);
  }, []);

  const scheduleStreamRetry = useCallback(() => {
    streamRetryCountRef.current += 1;
    const tries = streamRetryCountRef.current;

    setStreamRetries(tries);
    setStreamHasFrame(false);
    lastFrameAtRef.current = 0;

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
    lastFrameAtRef.current = 0;
    setStreamAttempt((a) => a + 1);
  }, []);

  const refreshStream = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;

    // Do not reset `streamHasFrame` here; keep last frame visible while the browser reconnects.
    setStreamAttempt((a) => a + 1);
  }, []);

  // When disabled, clear any pending retries to avoid background timers updating state.
  useEffect(() => {
    if (enabled) return;
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;
    streamRetryCountRef.current = 0;
    lastFrameAtRef.current = 0;
    setStreamRetries(0);
    setStreamHasFrame(false);
  }, [enabled]);

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

  // Periodic refresh to recover from silent MJPEG stalls after initial load.
  useEffect(() => {
    const interval = Number(refreshIntervalMs || 0);
    if (!enabled) return;
    if (!streamUrl) return;
    if (!Number.isFinite(interval) || interval <= 0) return;

    const t = window.setInterval(() => {
      if (streamHasFrameRef.current) refreshStream();
    }, interval);

    return () => window.clearInterval(t);
  }, [enabled, refreshIntervalMs, refreshStream, streamUrl]);

  // Stale-frame watchdog: after first frame, force reload if frame callbacks stop for too long.
  useEffect(() => {
    const staleMs = Number(staleAfterMs || 0);
    if (!enabled) return;
    if (!streamUrl) return;
    if (!streamHasFrame) return;
    if (!Number.isFinite(staleMs) || staleMs <= 0) return;

    const tickMs = Math.max(1000, Math.min(5000, Math.floor(staleMs / 3)));
    const t = window.setInterval(() => {
      const lastFrameAt = lastFrameAtRef.current;
      if (!lastFrameAt) return;
      if (Date.now() - lastFrameAt >= staleMs) {
        forceStreamReloadNow();
      }
    }, tickMs);

    return () => window.clearInterval(t);
  }, [enabled, forceStreamReloadNow, staleAfterMs, streamHasFrame, streamUrl]);

  const onFrame = useCallback(() => {
    if (streamRetryTimerRef.current) window.clearTimeout(streamRetryTimerRef.current);
    streamRetryTimerRef.current = null;

    streamRetryCountRef.current = 0;
    lastFrameAtRef.current = Date.now();
    setStreamRetries(0);
    setStreamHasFrame(true);
  }, []);

  const imgKey = useMemo(
    () => `${streamUrl}:${mountNonce}:${streamAttempt}`,
    [mountNonce, streamAttempt, streamUrl],
  );

  return {
    streamAttempt,
    streamSrc,
    streamHasFrame,
    streamRetries,
    imgKey,
    onFrame,
    onError: scheduleStreamRetry,
    resetStream,
    refreshStream,
  };
}

