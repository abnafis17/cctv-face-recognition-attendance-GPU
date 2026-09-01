import { Router } from "express";
import {
  createErpSettings,
  deleteErpSettings,
  getErpSettings,
  updateErpSettings,
} from "../controllers/erpSettings.controller";
import {
  createRelaySettings,
  deleteRelaySettings,
  getRelaySettings,
  updateRelaySettings,
} from "../controllers/relaySettings.controller";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../controllers/users.controller";

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

router.get("/users", getUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

export default router;
