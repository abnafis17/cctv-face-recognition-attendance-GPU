import { Router } from "express";
import {
  deleteEmployeeTemplates,
  getTemplates,
  replaceEmployeeTemplates,
  upsertTemplate,
} from "./controller";

const router = Router();

router.get("/templates", getTemplates);
router.post("/templates", upsertTemplate);
router.post("/templates/replace", replaceEmployeeTemplates);
router.delete("/templates/employee/:employeeId", deleteEmployeeTemplates);

export default router;
