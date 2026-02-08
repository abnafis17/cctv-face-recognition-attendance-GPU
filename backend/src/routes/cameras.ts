import { Router } from "express";
import {
  createCamera,
  deleteCamera,
  listCameras,
  updateCamera,
} from "../controllers/cameras.controller";

const router = Router();

router.get("/", listCameras);
router.post("/", createCamera);
router.patch("/:id", updateCamera);
router.put("/:id", updateCamera); // backward compatibility
router.delete("/:id", deleteCamera);

export default router;
