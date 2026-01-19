import { Router } from "express";
import {
  attendanceEvents,
  createAttendance,
  dataSync,
  listAttendance,
} from "../controllers/attendance.controller";

const router = Router();

router.post("/", createAttendance);
router.get("/", listAttendance);
router.get("/events", attendanceEvents);
router.get("/data-sync", dataSync);

export default router;
