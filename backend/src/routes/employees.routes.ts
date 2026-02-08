import { Router } from "express";
import {
  deleteEmployee,
  getEmployees,
  listEmployeeGroupValues,
  updateEmployee,
  upsertEmployee,
} from "../controllers/employees.controller";

const router = Router();

router.get("/group-values", listEmployeeGroupValues);
router.get("/", getEmployees);
router.post("/", upsertEmployee);

// update only name and/or empId
router.patch("/:id", updateEmployee);

// delete employee
router.delete("/:id", deleteEmployee);

export default router;
