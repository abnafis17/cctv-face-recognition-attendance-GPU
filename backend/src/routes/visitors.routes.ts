import { Router } from "express";
import multer from "multer";
import {
  createVisitorRecord,
  listVisitorRecords,
  lookupVisitor,
  checkOutVisitor,
  getEmployeeWiseReport,
  getVisitorWiseReport,
} from "../controllers/visitors.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.get("/lookup", lookupVisitor);
router.get("/reports/employee-wise", getEmployeeWiseReport);
router.get("/reports/visitor-wise", getVisitorWiseReport);
router.get("/", listVisitorRecords);
router.post("/", upload.single("visitorPhoto"), createVisitorRecord);
router.post("/:id/checkout", checkOutVisitor);

export default router;
