"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Camera } from "@/types";
import axiosInstance from "@/config/axiosInstance";

type UseCameraCrudArgs = {
  // form state (same as your page)
  newId: string;
  newName: string;
  newUrl: string;

  // setters (so hook can reset exactly like your code)
  setNewId: Dispatch<SetStateAction<string>>;
  setNewName: Dispatch<SetStateAction<string>>;
  setNewUrl: Dispatch<SetStateAction<string>>;

  // error setter (same as your page)
  setErr: Dispatch<SetStateAction<string>>;

  // loader (your existing load() function)
  load: () => Promise<void>;
};

export function useCameraCrud({
  newId,
  newName,
  newUrl,
  setNewId,
  setNewName,
  setNewUrl,
  setErr,
  load,
}: UseCameraCrudArgs) {
  // ---------- Camera CRUD ----------
  async function addCamera() {
    try {
      setErr("");
      await axiosInstance.post("/cameras", {
        camId: newId.trim() ? newId.trim() : undefined,
        name: newName.trim(),
        rtspUrl: newUrl.trim(),
      });

      setNewId("");
      setNewName("");
      setNewUrl("");

      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to add camera");
      setErr(msg);
    }
  }

  async function startCamera(cam: Camera) {
    try {
      await axiosInstance.post(`/cameras/start/${cam.id}`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to start camera");
      setErr(msg);
    }
  }

  async function stopCamera(cam: Camera) {
    try {
      await axiosInstance.post(`/cameras/stop/${cam.id}`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to stop camera");
      setErr(msg);
    }
  }

  return { addCamera, startCamera, stopCamera };
}
