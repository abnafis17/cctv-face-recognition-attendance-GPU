import { Router } from "express";
import {
  headcountEvents,
  listHeadcountCameras,
} from "./controller";
import { listHeadcount } from "../../../controllers/attendance.headcount.controller";

const router = Router();

router.get("/cameras", listHeadcountCameras);
router.get("/events", headcountEvents);
router.get("/list", listHeadcount);
router.get("/", listHeadcount);

export default router;
