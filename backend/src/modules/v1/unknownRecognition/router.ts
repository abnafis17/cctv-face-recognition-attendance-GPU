import { Router } from "express";
import {
  createUnknownRecognition,
  listUnknownRecognitions,
} from "./controller";

const router = Router();

router.post("/", createUnknownRecognition);
router.get("/", listUnknownRecognitions);

export default router;
