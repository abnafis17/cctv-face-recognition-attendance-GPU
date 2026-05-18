import { Router } from "express";
import {
  createCamera,
  deleteCamera,
  listCameraAuthorizedEmployees,
  listCameras,
  updateCameraAuthorizedEmployees,
  updateCamera,
} from "../controllers/cameras.controller";

const router = Router();

router.get("/", listCameras);
router.post("/", createCamera);
router.get("/:id/authorized-employees", listCameraAuthorizedEmployees);
router.put("/:id/authorized-employees", updateCameraAuthorizedEmployees);
router.patch("/:id/authorized-employees", updateCameraAuthorizedEmployees);
router.patch("/:id", updateCamera);
router.put("/:id", updateCamera); // backward compatibility
router.delete("/:id", deleteCamera);

export default router;
