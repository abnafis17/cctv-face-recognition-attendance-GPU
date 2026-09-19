import { Router } from "express";
import { triggerErpAttendanceLiveSync } from "./controller";

const router = Router();

router.post("/sync", triggerErpAttendanceLiveSync);

export default router;
