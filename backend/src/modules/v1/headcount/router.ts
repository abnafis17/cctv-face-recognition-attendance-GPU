import { Router } from "express";
import {
  headcountEvents,
  listHeadcount,
  listHeadcountCameras,
} from "./controller";

const router = Router();

router.get("/cameras", listHeadcountCameras);
router.get("/events", headcountEvents);
router.get("/list", listHeadcount);
router.get("/", listHeadcount);

export default router;
