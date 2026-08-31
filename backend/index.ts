import dotenv from "dotenv";
import { app } from "./src/app";
import { bootstrap } from "./src/bootstrap";
import { disconnectPrisma } from "./src/prisma";
import { autoStartRtspCamerasOnBoot } from "./src/services/cameraAutostart.service";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

async function startServer() {
  try {
    await bootstrap();
  } catch (error) {
    console.error("[BOOTSTRAP] failed:", error);
  }

  const server = app.listen(PORT, () => {
    console.log(`Backend running: http://localhost:${PORT}`);

    // Important: run camera autostart only after backend is listening.
    // AI recognition startup calls backend APIs (gallery/templates), so running
    // autostart earlier causes avoidable startup failures.
    void autoStartRtspCamerasOnBoot().catch((error) => {
      console.error("[CAMERA-AUTOSTART] unexpected error:", error);
    });
  });

  // Graceful shutdown handling for Jetson Orin Nano & production process managers
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[BACKEND] Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      console.log("[BACKEND] Closed HTTP server.");
      await disconnectPrisma();
      console.log("[BACKEND] Shutdown complete.");
      process.exit(0);
    });

    // Force shutdown if taking longer than 5 seconds
    setTimeout(() => {
      console.error("[BACKEND] Forced shutdown after timeout.");
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

void startServer();
