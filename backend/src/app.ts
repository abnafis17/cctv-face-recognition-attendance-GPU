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
app.use(routes);
