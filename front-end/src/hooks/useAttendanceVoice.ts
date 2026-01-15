"use client";

import { useEffect, useRef } from "react";
import axiosInstance from "@/config/axiosInstance";

function pickSweetFemaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices?.length) return null;

  const hint = (v: SpeechSynthesisVoice) => (v?.name || "").toLowerCase();
  const femaleHints = [
    "zira",
    "aria",
    "jenny",
    "susan",
    "samantha",
    "natasha",
    "serena",
    "fiona",
    "tessa",
    "moira",
    "female",
  ];

  const en = voices.filter((v) =>
    (v?.lang || "").toLowerCase().startsWith("en")
  );
  const ordered = [...en, ...voices];

  for (const v of ordered) {
    const n = hint(v);
    if (femaleHints.some((h) => n.includes(h))) return v;
  }

  return en[0] || voices[0] || null;
}

type VoiceEvent = {
  seq?: number;
  text?: string;
  at?: string;
};

type UseAttendanceVoiceOptions = {
  pollIntervalMs?: number; // default 600
  limit?: number; // default 50
};

export function useAttendanceVoice(options: UseAttendanceVoiceOptions = {}) {
  const { pollIntervalMs = 600, limit = 50 } = options;

  // ---------- Attendance voice (serial, no overlap) ----------
  const voiceSeqRef = useRef<number>(0);
  const voiceInFlightRef = useRef(false);
  const voiceOpenedAtRef = useRef<number>(Date.now());
  const voiceQueueRef = useRef<string[]>([]);
  const voiceSpeakingRef = useRef(false);
  const voiceUnlockedRef = useRef(true);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  function drainVoiceQueue() {
    if (voiceSpeakingRef.current) return;
    if (!voiceUnlockedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const text = (voiceQueueRef.current.shift() || "").trim();
    if (!text) return;

    voiceSpeakingRef.current = true;

    try {
      window.speechSynthesis.resume();

      const u = new SpeechSynthesisUtterance(text);
      const v = preferredVoiceRef.current;
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }

      // "Sweet" voice style (best-effort; depends on the installed voice)
      u.rate = 0.92;
      u.pitch = 1.12;
      u.volume = 1.0;

      let didStartCheck = 0;

      u.onend = () => {
        if (didStartCheck) window.clearTimeout(didStartCheck);
        voiceSpeakingRef.current = false;
        drainVoiceQueue();
      };
      u.onerror = () => {
        if (didStartCheck) window.clearTimeout(didStartCheck);
        voiceSpeakingRef.current = false;
        drainVoiceQueue();
      };

      window.speechSynthesis.speak(u);

      // If speech is blocked (autoplay policy), it may silently not start.
      // Detect that and defer until a user gesture unlocks it.
      didStartCheck = window.setTimeout(() => {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending)
          return;
        voiceUnlockedRef.current = false;
        voiceSpeakingRef.current = false;
        voiceQueueRef.current.unshift(text);
      }, 250);
    } catch {
      voiceSpeakingRef.current = false;
    }
  }

  function enqueueVoice(text: string) {
    const t = String(text || "").trim();
    if (!t) return;

    // Prevent unbounded growth if ERP spams events
    if (voiceQueueRef.current.length > 200) {
      voiceQueueRef.current = voiceQueueRef.current.slice(-100);
    }

    voiceQueueRef.current.push(t);
    drainVoiceQueue();
  }

  // Load voices + unlock speech on first user interaction (browser policy)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const voices = synth.getVoices();
      if (!voices?.length) return;
      preferredVoiceRef.current = pickSweetFemaleVoice(voices);
    };

    const unlock = () => {
      voiceUnlockedRef.current = true;
      loadVoices();
      drainVoiceQueue();
    };

    loadVoices();
    synth.onvoiceschanged = loadVoices;
    window.addEventListener("pointerdown", unlock);

    return () => {
      synth.onvoiceschanged = null;
      window.removeEventListener("pointerdown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Poll attendance voice events from AI (via backend proxy) ----------
  useEffect(() => {
    let cancelled = false;

    async function pollVoice() {
      if (cancelled) return;
      if (voiceInFlightRef.current) return;
      voiceInFlightRef.current = true;

      try {
        const resp = await axiosInstance.get(
          "/attendance-control/voice-events",
          {
            params: { afterSeq: voiceSeqRef.current, limit },
          }
        );

        const events = (resp?.data?.events || []) as VoiceEvent[];

        for (const ev of events) {
          const seq = Number(ev?.seq || 0) || 0;
          const text = String(ev?.text || "").trim();
          if (!seq) continue;
          if (seq <= voiceSeqRef.current) continue;
          voiceSeqRef.current = seq;

          // Avoid speaking old backlog events when the page first loads,
          // but still allow events that happen during initial load.
          const atMs = Date.parse(String(ev?.at || ""));
          const tooOld =
            Number.isFinite(atMs) && atMs < voiceOpenedAtRef.current - 2000;

          if (!text || tooOld) continue;
          enqueueVoice(text);
        }
      } catch {
        // ignore polling errors; voice is best-effort
      } finally {
        voiceInFlightRef.current = false;
      }
    }

    const first = window.setTimeout(() => pollVoice(), 0);
    const t = window.setInterval(() => pollVoice(), pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollIntervalMs, limit]);
}
