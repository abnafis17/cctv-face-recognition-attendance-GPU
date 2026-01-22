import { Router } from "express";
import {
  listHeadcount,
  listHeadcountCameras,
} from "../controllers/attendance.headcount.controller";

const router = Router();

router.get("/cameras", listHeadcountCameras);
router.get("/", listHeadcount);

export default router;
