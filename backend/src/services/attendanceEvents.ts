import { EventEmitter } from "events";

export type AttendanceEvent = {
  seq: number;
  at: string;
  attendanceId?: string;
  employeeId?: string;
  timestamp?: string;
  cameraId?: string | null;
};

type CompanyState = {
  seq: number;
  events: AttendanceEvent[];
  emitter: EventEmitter;
};

const MAX_EVENTS = Math.max(
  0,
  Number(process.env.ATT_EVENTS_MAX ?? 500) || 500
);

const statesByCompany = new Map<string, CompanyState>();

function getCompanyKey(companyId: string) {
  const key = String(companyId || "").trim();
  return key || "__default__";
}

function getState(companyId: string): CompanyState {
  const key = getCompanyKey(companyId);
  const existing = statesByCompany.get(key);
  if (existing) return existing;

  const s: CompanyState = {
    seq: 0,
    events: [],
    emitter: new EventEmitter(),
  };
  // long-polling can create many concurrent listeners
  s.emitter.setMaxListeners(0);
  statesByCompany.set(key, s);
  return s;
}

function snapshot(state: CompanyState, afterSeq: number, limit: number) {
  const latest_seq = Number(state.seq) || 0;
  const events = state.events
    .filter((e) => (Number(e.seq) || 0) > afterSeq)
    .slice(0, limit);
  return { latest_seq, events };
}

export function pushAttendanceEvent(
  companyId: string,
  event: Omit<AttendanceEvent, "seq">
): number {
  const state = getState(companyId);
  state.seq += 1;
  const seq = state.seq;

  state.events.push({ seq, ...event });
  if (MAX_EVENTS > 0 && state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }

  state.emitter.emit("new", seq);
  return seq;
}

export async function getAttendanceEvents(params: {
  companyId: string;
  afterSeq?: number;
  limit?: number;
  waitMs?: number;
  signal?: AbortSignal;
}): Promise<{ latest_seq: number; events: AttendanceEvent[] }> {
  const afterSeq = Math.max(0, Number(params.afterSeq ?? 0) || 0);
  const limit = Math.min(Math.max(Number(params.limit ?? 50) || 50, 1), 200);
  const waitMs = Math.min(Math.max(Number(params.waitMs ?? 0) || 0, 0), 300_000);
  const signal = params.signal;

  const state = getState(params.companyId);

  const immediate = snapshot(state, afterSeq, limit);
  if (immediate.events.length > 0 || waitMs <= 0) return immediate;

  return await new Promise((resolve) => {
    let done = false;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      state.emitter.removeListener("new", onNew);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    const finish = () => {
      const out = snapshot(state, afterSeq, limit);
      cleanup();
      resolve(out);
    };

    const onNew = () => {
      if (done) return;
      if (Number(state.seq) <= afterSeq) return;
      finish();
    };

    const onAbort = () => {
      if (done) return;
      cleanup();
      resolve(snapshot(state, afterSeq, limit));
    };

    if (signal?.aborted) return onAbort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    state.emitter.on("new", onNew);
    timer = setTimeout(() => finish(), waitMs);

    // Avoid race: if an event arrived after our first snapshot but before listener attach
    if (Number(state.seq) > afterSeq) finish();
  });
}

