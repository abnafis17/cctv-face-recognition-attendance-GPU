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
  listUserRoles,
  createUserRole,
  updateUserRole,
  deleteUserRole,
} from "./controller";

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

// User Role routes
router.get("/user-roles", listUserRoles);
router.post("/user-roles", createUserRole);
router.put("/user-roles/:id", updateUserRole);
router.delete("/user-roles/:id", deleteUserRole);

export default router;
