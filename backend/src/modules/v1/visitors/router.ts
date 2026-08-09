import { Router } from "express";
import multer from "multer";
import {
  createVisitorRecord,
  listVisitorRecords,
  lookupVisitor,
  checkOutVisitor,
  getEmployeeWiseReport,
  getVisitorWiseReport,
  recognizeVisitorFace,
  deleteVisitorRecord,
} from "./controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.get("/lookup", lookupVisitor);
router.post("/recognize-face", upload.single("visitorPhoto"), recognizeVisitorFace);
router.get("/reports/employee-wise", getEmployeeWiseReport);
router.get("/reports/visitor-wise", getVisitorWiseReport);
router.get("/", listVisitorRecords);
router.post("/", upload.single("visitorPhoto"), createVisitorRecord);
router.post("/:id/checkout", checkOutVisitor);
router.delete("/:id", deleteVisitorRecord);

export default router;
