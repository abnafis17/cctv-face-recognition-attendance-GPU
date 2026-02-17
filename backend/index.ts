import dotenv from "dotenv";
import { app } from "./src/app";
import { bootstrap } from "./src/bootstrap";
import { autoStartRtspCamerasOnBoot } from "./src/services/cameraAutostart.service";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

async function startServer() {
  try {
    await bootstrap();
  } catch (error) {
    console.error("[BOOTSTRAP] failed:", error);
  }

  app.listen(PORT, () => {
    console.log(`Backend running: http://localhost:${PORT}`);

    // Important: run camera autostart only after backend is listening.
    // AI recognition startup calls backend APIs (gallery/templates), so running
    // autostart earlier causes avoidable startup failures.
    void autoStartRtspCamerasOnBoot().catch((error) => {
      console.error("[CAMERA-AUTOSTART] unexpected error:", error);
    });
  });
}

void startServer();
