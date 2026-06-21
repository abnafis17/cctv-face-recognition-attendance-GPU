import { Router } from "express";
import {
  listVisitorTypes,
  createVisitorType,
  updateVisitorType,
  deleteVisitorType,
  listPurposesOfVisit,
  createPurposeOfVisit,
  updatePurposeOfVisit,
  deletePurposeOfVisit,
} from "../controllers/masterData.controller";

const router = Router();

// Visitor Type routes
router.get("/visitor-types", listVisitorTypes);
router.post("/visitor-types", createVisitorType);
router.put("/visitor-types/:id", updateVisitorType);
router.delete("/visitor-types/:id", deleteVisitorType);

// Purpose of Visit routes
router.get("/purposes-of-visit", listPurposesOfVisit);
router.post("/purposes-of-visit", createPurposeOfVisit);
router.put("/purposes-of-visit/:id", updatePurposeOfVisit);
router.delete("/purposes-of-visit/:id", deletePurposeOfVisit);

export default router;
