"use client";

import { useEffect, useRef } from "react";
import type { Session } from "../types";
import { stepLabel } from "../utils";

type UseEnrollmentVoiceArgs = {
  session: Session | null;
  sessionStatus?: Session["status"];
  speak: (key: string, text: string) => void;
};

/**
 * Keeps speech logic identical to the original component:
 * - speaks on backend voice events (voice_seq/voice_text)
 * - fallback speaks instruction on step change if no voice event yet
 * - cancels any speech when session leaves "running"
 */
export function useEnrollmentVoice({ session, sessionStatus, speak }: UseEnrollmentVoiceArgs) {
  const lastVoiceSeqRef = useRef<number>(-1);
  const lastStepRef = useRef<string>("");

  // Speak when backend emits voice event
  useEffect(() => {
    if (sessionStatus !== "running") return;
    const seq = session?.voice_seq;
    const text = (session?.voice_text || "").trim();
    if (typeof seq !== "number") return;
    if (!text) return;
    if (lastVoiceSeqRef.current === seq) return;

    lastVoiceSeqRef.current = seq;
    speak(`voice:${seq}`, text);
  }, [sessionStatus, session?.voice_seq, session?.voice_text, speak, session]);

  // Fallback: speak instruction on step change (only if no voice events yet)
  useEffect(() => {
    if (!session) return;
    if (session.status !== "running") return;
    const step = session?.current_step;
    if (!step) return;

    if (lastStepRef.current !== step) {
      const instr = (session?.instruction || stepLabel(step)).trim();
      if (lastVoiceSeqRef.current < 0) {
        speak(`step:${step}`, instr);
      }
      lastStepRef.current = step;
    }
  }, [session, session?.current_step, session?.instruction, speak]);

  // Stop/cancel speech when session ends
  useEffect(() => {
    if (!sessionStatus) return;
    if (sessionStatus === "running") return;
    window.speechSynthesis.cancel();
  }, [sessionStatus]);
}
