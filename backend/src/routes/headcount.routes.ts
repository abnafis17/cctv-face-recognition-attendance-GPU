import { Router } from "express";
import {
  headcountEvents,
  listHeadcount,
  listHeadcountCameras,
} from "../controllers/attendance.headcount.controller";

const router = Router();

router.get("/cameras", listHeadcountCameras);
router.get("/events", headcountEvents);
router.get("/", listHeadcount);

export default router;
