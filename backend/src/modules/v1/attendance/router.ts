import { Router } from "express";
import {
  attendanceEvents,
  createAttendance,
  dataSync,
  listAttendance,
} from "./attendance.controller";
import { listDailyAttendance } from "./daily.controller";

const router = Router();

// Attendance
router.post("/", createAttendance);
router.get("/", listAttendance);
router.get("/daily", listDailyAttendance);
router.get("/events", attendanceEvents);
router.get("/data-sync", dataSync);

export default router;
