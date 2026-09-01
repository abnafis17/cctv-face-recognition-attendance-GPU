import { Router } from "express";
import {
  register,
  getRoles,
  getCompanies,
  getModules,
  login,
  refresh,
  logout,
  getMe,
  getPermissions,
  updatePermissions,
} from "./controller";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.get("/roles", getRoles);
authRouter.get("/companies", getCompanies);
authRouter.get("/modules", getModules);
authRouter.post("/login", login);
authRouter.get("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", getMe);
authRouter.get("/permissions", getPermissions);
authRouter.post("/permissions", updatePermissions);
