import { Router } from "express";
import {
  getRelaySettings,
  createRelaySettings,
  updateRelaySettings,
  deleteRelaySettings,
} from "./relay.controller";
import {
  getErpSettings,
  createErpSettings,
  updateErpSettings,
  deleteErpSettings,
} from "./erp.controller";
import userRouter from "../user/router";

const router = Router();

router.get("/relay", getRelaySettings);
router.post("/relay", createRelaySettings);
router.put("/relay", updateRelaySettings);
router.patch("/relay", updateRelaySettings);
router.delete("/relay", deleteRelaySettings);

router.get("/erp", getErpSettings);
router.post("/erp", createErpSettings);
router.put("/erp", updateErpSettings);
router.patch("/erp", updateErpSettings);
router.delete("/erp", deleteErpSettings);

router.use("/users", userRouter);

export default router;
