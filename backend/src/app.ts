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
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, Postman)
      if (!origin) return callback(null, true);

      // Explicit origins defined in env
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any host on the 10.81.100.x subnet (e.g. http://10.81.100.any:3000)
      if (/^http:\/\/10\.81\.100\.\d+(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Allow local development (localhost / 127.0.0.1)
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use("/api/v1", routes);
