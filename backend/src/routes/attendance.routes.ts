import { Router } from "express";
import {
  attendanceEvents,
  createAttendance,
  dataSync,
  listAttendance,
} from "../controllers/attendance.controller";
import { listDailyAttendance } from "../controllers/attendance.daily.controller";
import headcountRoutes from "./headcount.routes";

const router = Router();

// Attendance
router.post("/", createAttendance);
router.get("/", listAttendance);
router.get("/daily", listDailyAttendance);
router.get("/events", attendanceEvents);
router.get("/data-sync", dataSync);

export default router;
