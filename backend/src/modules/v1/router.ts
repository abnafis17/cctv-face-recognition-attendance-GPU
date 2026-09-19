import { Router } from "express";

import healthRoutes from "./health/router";
import employeesRoutes from "./employees/router";
import galleryRoutes from "./gallery/router";
import attendanceRoutes from "./attendance/router";
import statsRoutes from "./stats/router";
import camerasRoutes from "./cameras/router";
import attendanceControl from "./attendance/control.router";
import cameraControl from "./cameras/control.router";
import enroll2AutoRoutes from "./enroll2Auto/router";
import { authRouter } from "./auth/router";
import { requireCompany } from "../../middleware/company";
import settingsRoutes from "./settings/router";
import unknownRecognitionRoutes from "./unknownRecognition/router";
import gatepassRoutes from "./gatepass/router";
import visitorRoutes from "./visitors/router";
import masterDataRoutes from "./masterData/router";
import headcountRoutes from "./headcount/router";
import presenceControl from "./presence/router";
import erpManualAttendanceRoutes from "./erp_manual_attendance/router";
import attendanceLiveManualAttendanceRoutes from "./attendance_live_manual_attendance/router";

import { updateGatepassErpStatus } from "./gatepass/controller";

const router = Router();

// system
router.use("/health", healthRoutes);

// ERP Status webhook callback
router.post("/gatepass-erp-status", updateGatepassErpStatus);

//authentication
router.use("/auth", authRouter);

// core resources
router.use("/employees", requireCompany, employeesRoutes);
router.use("/gallery", requireCompany, galleryRoutes);
router.use("/attendance", requireCompany, attendanceRoutes);
router.use("/headcount", requireCompany, headcountRoutes);
router.use("/stats", requireCompany, statsRoutes);
router.use("/erp-manual-attendance", requireCompany, erpManualAttendanceRoutes);
router.use("/attendance-live-manual-attendance", requireCompany, attendanceLiveManualAttendanceRoutes);

// cameras
router.use("/cameras", requireCompany, camerasRoutes);
router.use("/cameras", requireCompany, cameraControl);

// controls
router.use("/attendance-control", requireCompany, attendanceControl);
router.use("/presence-control", requireCompany, presenceControl);

// enroll2 auto routes
router.use("/enroll2-auto", requireCompany, enroll2AutoRoutes);

// settings
router.use("/settings", requireCompany, settingsRoutes);
router.use("/unknown-recognitions", requireCompany, unknownRecognitionRoutes);
router.use("/gatepass", requireCompany, gatepassRoutes);
router.use("/visitors", requireCompany, visitorRoutes);
router.use("/master-data", requireCompany, masterDataRoutes);

export default router;
