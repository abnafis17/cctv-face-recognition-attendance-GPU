import { Router } from "express";

import healthRoutes from "./health.routes";
import employeesRoutes from "./employees.routes";
import galleryRoutes from "./gallery.routes";
import attendanceRoutes from "./attendance.routes";
import statsRoutes from "./stats.routes";
import camerasRoutes from "./cameras";
import attendanceControl from "./attendanceControl";
import cameraControl from "./cameras.control";
import enroll2AutoRoutes from "./enroll2Auto.routes";
import { authRouter } from "./auth.routes";
import { requireCompany } from "../middleware/company";
import headcountRoutes from "./headcount.routes";

const router = Router();

// 🔹 system
router.use("/health", healthRoutes);

//authentication
router.use("/auth", authRouter);

// 🔹 core resources
router.use("/employees", requireCompany, employeesRoutes);
router.use("/gallery", requireCompany, galleryRoutes);
router.use("/attendance", requireCompany, attendanceRoutes);
router.use("/stats", requireCompany, statsRoutes);

// 🔹 cameras
router.use("/cameras", requireCompany, camerasRoutes);
router.use("/cameras", requireCompany, cameraControl);

// 🔹 controls
router.use("/attendance-control", requireCompany, attendanceControl);

router.use("/enroll2-auto", requireCompany, enroll2AutoRoutes);

// ✅ new headcount feature
router.use("/headcount", requireCompany, headcountRoutes);

export default router;
