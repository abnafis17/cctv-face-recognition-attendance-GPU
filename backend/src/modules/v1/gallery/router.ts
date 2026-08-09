import { Router } from "express";
import {
  getTemplates,
  upsertTemplate,
} from "./controller";

const router = Router();

router.get("/templates", getTemplates);
router.post("/templates", upsertTemplate);

export default router;
