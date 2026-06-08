import { Router } from "express";

import healthRoutes from "./health.routes";
import employeesRoutes from "./employees.routes";
import galleryRoutes from "./gallery.routes";
import attendanceRoutes from "./attendance.routes";
import statsRoutes from "./stats.routes";
import camerasRoutes from "./cameras";
import attendanceControl from "./attendanceControl";
import cameraControl from "./cameras.control";
import presenceControl from "./presence.control";
import enroll2AutoRoutes from "./enroll2Auto.routes";
import { authRouter } from "./auth.routes";
import { requireCompany } from "../middleware/company";
import headcountRoutes from "./headcount.routes";
import settingsRoutes from "./settings.routes";
import unknownRecognitionRoutes from "./unknownRecognition.routes";
import gatepassRoutes from "./gatepass.routes";
import visitorRoutes from "./visitors.routes";

const router = Router();

// system
router.use("/health", healthRoutes);

//authentication
router.use("/auth", authRouter);

// core resources
router.use("/employees", requireCompany, employeesRoutes);
router.use("/gallery", requireCompany, galleryRoutes);
router.use("/attendance", requireCompany, attendanceRoutes);
router.use("/stats", requireCompany, statsRoutes);

// cameras
router.use("/cameras", requireCompany, camerasRoutes);
router.use("/cameras", requireCompany, cameraControl);

// controls
router.use("/attendance-control", requireCompany, attendanceControl);
router.use("/presence-control", requireCompany, presenceControl);

// enroll2 auto routes
router.use("/enroll2-auto", requireCompany, enroll2AutoRoutes);

// new headcount feature
router.use("/headcount", requireCompany, headcountRoutes);

// settings
router.use("/settings", requireCompany, settingsRoutes);
router.use("/unknown-recognitions", requireCompany, unknownRecognitionRoutes);
router.use("/gatepass", requireCompany, gatepassRoutes);
router.use("/visitors", requireCompany, visitorRoutes);

export default router;
