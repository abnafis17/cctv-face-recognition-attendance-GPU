import express from "express";
import cors from "cors";
import routes from "./routes";

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins, // ✅ array format
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
// Your central MediaMTX server
const MTX_HOST = process.env.MTX_HOST || "10.81.100.96";
const RTSP_PORT = process.env.RTSP_PORT || "8554";
const WEBRTC_PORT = process.env.WEBRTC_PORT || "8000";

// In-memory registry (replace with DB if needed)
const streams = new Map(); // streamId -> { userId, createdAt, path }

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

app.post("/api/stream/start", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: "userId required" });

  const streamId = `${userId}_${Date.now()}_${makeId()}`;
  const path = `live/${streamId}`;

  const whipUrl = `http://${MTX_HOST}:${WEBRTC_PORT}/${path}/whip`;
  const publishPageUrl = `http://${MTX_HOST}:${WEBRTC_PORT}/${path}/publish`; // optional UI :contentReference[oaicite:6]{index=6}
  const rtspUrl = `rtsp://${MTX_HOST}:${RTSP_PORT}/${path}`;

  streams.set(streamId, { userId, createdAt: Date.now(), path });

  res.json({
    ok: true,
    streamId,
    path,
    whipUrl,
    publishPageUrl,
    rtspUrl,
  });
});

// You can use this to “invalidate” streamId on your side.
// MediaMTX stream stops automatically when browser stops publishing.
app.post("/api/stream/stop", (req, res) => {
  const { streamId } = req.body;
  if (streamId) streams.delete(streamId);
  res.json({ ok: true });
});


app.use("/api/v1", routes);
