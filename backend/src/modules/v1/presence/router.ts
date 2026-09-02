import { Router } from "express";
import { startPresenceCamera, stopPresenceCamera } from "./controller";

const router = Router();

router.post("/start/:id", startPresenceCamera);
router.post("/stop/:id", stopPresenceCamera);

export default router;
