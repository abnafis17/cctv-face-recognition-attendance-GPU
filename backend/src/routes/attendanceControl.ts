import { Router } from "express";
import axios from "axios";

const r = Router();
const AI = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

r.post("/start", async (_req, res) => {
  const ai = await axios.post(`${AI}/attendance/start`);
  res.json(ai.data);
});

r.post("/stop", async (_req, res) => {
  const ai = await axios.post(`${AI}/attendance/stop`);
  res.json(ai.data);
});

r.get("/status", async (_req, res) => {
  const ai = await axios.get(`${AI}/attendance/status`);
  res.json(ai.data);
});

r.get("/voice-events", async (req, res) => {
  try {
    const afterSeqRaw = (req.query.afterSeq ?? req.query.after_seq ?? 0) as any;
    const limitRaw = (req.query.limit ?? 50) as any;

    const after_seq = Number(afterSeqRaw || 0) || 0;
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);

    const ai = await axios.get(`${AI}/attendance/voice-events`, {
      params: { after_seq, limit },
    });
    return res.status(ai.status).json(ai.data);
  } catch (err: any) {
    console.error("attendance voice-events failed:", err?.response?.data || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch attendance voice events" });
  }
});

export default r;
