"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import axiosInstance, { API } from "@/config/axiosInstance";
import type { Camera } from "@/types";

import {
  createEditableBox,
  editableBoxFromRecord,
  editableBoxToPayload,
  serializeEditableBoxes,
  sortDistinctIds,
} from "./boundingBoxUtils";
import type {
  BoundingBoxRect,
  BoundingBoxEmployeeOption,
  CameraBoundingBoxesState,
  EditableBoundingBox,
} from "./types";

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
      };
    };
    message?: string;
  };

  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

type UseCameraBoundingBoxesArgs = {
  camera: Camera | null;
  open: boolean;
};

export function useCameraBoundingBoxes({
  camera,
  open,
}: UseCameraBoundingBoxesArgs) {
  const cameraId = String(camera?.id ?? "").trim();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<BoundingBoxEmployeeOption[]>([]);
  const [boxes, setBoxes] = useState<EditableBoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [loadedSignature, setLoadedSignature] = useState("[]");

  const applyState = useCallback(
    (
      state: CameraBoundingBoxesState,
      preferredSelection?: {
        persistedId?: string | null;
        index?: number;
      },
    ) => {
      const nextEmployees = Array.isArray(state.employees) ? state.employees : [];
      const nextBoxes = Array.isArray(state.boxes)
        ? [...state.boxes]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(editableBoxFromRecord)
        : [];

      setEmployees(nextEmployees);
      setBoxes(nextBoxes);
      setLoadedSignature(serializeEditableBoxes(nextBoxes));

      const preferredById = preferredSelection?.persistedId
        ? nextBoxes.find((box) => box.persistedId === preferredSelection.persistedId) ??
          null
        : null;
      const preferredByIndex =
        preferredSelection?.index !== undefined &&
        preferredSelection.index >= 0 &&
        preferredSelection.index < nextBoxes.length
          ? nextBoxes[preferredSelection.index]
          : null;

      setSelectedBoxId(preferredById?.id ?? preferredByIndex?.id ?? nextBoxes[0]?.id ?? null);
    },
    [],
  );

  const fetchState = useCallback(async () => {
    if (!cameraId) return;

    try {
      setLoading(true);
      const response = await axiosInstance.get<CameraBoundingBoxesState>(
        `${API.CAMERAS}/${cameraId}/bounding-boxes`,
      );
      applyState(response.data);
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to load camera bounding boxes"));
      setEmployees([]);
      setBoxes([]);
      setSelectedBoxId(null);
      setLoadedSignature("[]");
    } finally {
      setLoading(false);
    }
  }, [applyState, cameraId]);

  useEffect(() => {
    if (!open || !cameraId) return;
    void fetchState();
  }, [open, cameraId, fetchState]);

  useEffect(() => {
    if (boxes.length === 0) {
      if (selectedBoxId !== null) {
        setSelectedBoxId(null);
      }
      return;
    }

    const hasSelected = boxes.some((box) => box.id === selectedBoxId);
    if (!hasSelected) {
      setSelectedBoxId(boxes[0]?.id ?? null);
    }
  }, [boxes, selectedBoxId]);

  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId],
  );

  const isDirty = useMemo(
    () => serializeEditableBoxes(boxes) !== loadedSignature,
    [boxes, loadedSignature],
  );

  const addBox = useCallback((rect?: BoundingBoxRect) => {
    const nextBox = createEditableBox(boxes.length, rect);
    setBoxes((prev) => [...prev, nextBox]);
    setSelectedBoxId(nextBox.id);
    return nextBox.id;
  }, [boxes.length]);

  const updateBoxRect = useCallback((boxId: string, rect: BoundingBoxRect) => {
    setBoxes((prev) =>
      prev.map((box) => (box.id === boxId ? { ...box, rect } : box)),
    );
  }, []);

  const updateBoxName = useCallback((boxId: string, name: string) => {
    setBoxes((prev) =>
      prev.map((box) => (box.id === boxId ? { ...box, name } : box)),
    );
  }, []);

  const updateBoxEmployeeIds = useCallback((boxId: string, employeeIds: string[]) => {
    const nextIds = sortDistinctIds(employeeIds);
    setBoxes((prev) =>
      prev.map((box) =>
        box.id === boxId ? { ...box, employeeIds: nextIds } : box,
      ),
    );
  }, []);

  const removeBox = useCallback((boxId: string) => {
    setBoxes((prev) => prev.filter((box) => box.id !== boxId));
  }, []);

  const saveBoxes = useCallback(async () => {
    if (!cameraId) return false;

    const selectedIndex = boxes.findIndex((box) => box.id === selectedBoxId);
    const selectedPersistedId =
      boxes.find((box) => box.id === selectedBoxId)?.persistedId ?? null;

    try {
      setSaving(true);
      const response = await axiosInstance.put<CameraBoundingBoxesState>(
        `${API.CAMERAS}/${cameraId}/bounding-boxes`,
        {
          boxes: boxes.map(editableBoxToPayload),
        },
      );

      applyState(response.data, {
        persistedId: selectedPersistedId,
        index: selectedIndex,
      });
      toast.success("Bounding boxes saved");
      return true;
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to save camera bounding boxes"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyState, boxes, cameraId, selectedBoxId]);

  return {
    loading,
    saving,
    employees,
    boxes,
    selectedBox,
    selectedBoxId,
    isDirty,
    setSelectedBoxId,
    addBox,
    updateBoxRect,
    updateBoxName,
    updateBoxEmployeeIds,
    removeBox,
    refresh: fetchState,
    saveBoxes,
  };
}
