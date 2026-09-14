import { Router } from "express";
import { triggerErpAttendanceSync } from "./controller";

const router = Router();

router.post("/sync", triggerErpAttendanceSync);

export default router;
