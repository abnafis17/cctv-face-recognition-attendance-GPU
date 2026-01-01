import { Router } from "express";

import healthRoutes from "./health.routes";
import employeesRoutes from "./employees.routes";
import galleryRoutes from "./gallery.routes";
import attendanceRoutes from "./attendance.routes";
import statsRoutes from "./stats.routes";
import camerasRoutes from "./cameras";
import attendanceControl from "./attendanceControl";
import enrollControl from "./enrollControl";
import enrollSession from "./enrollSession";
import cameraControl from "./cameras.control";
import enroll2AutoRoutes from "./enroll2Auto.routes";

const router = Router();

// 🔹 system
router.use("/health", healthRoutes);

// 🔹 core resources
router.use("/employees", employeesRoutes);
router.use("/gallery", galleryRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/stats", statsRoutes);

// 🔹 cameras
router.use("/cameras", camerasRoutes);
router.use("/cameras", cameraControl);

// 🔹 controls
router.use("/attendance-control", attendanceControl);
router.use("/enroll", enrollControl);
router.use("/enroll-session", enrollSession);

router.use("/enroll2-auto", enroll2AutoRoutes);

export default router;
