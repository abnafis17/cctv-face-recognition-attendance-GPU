"use client";

import { useCallback, useMemo, useState } from "react";
import type { RecognizedGatepassRow } from "@/types/gatepass-types";
import { useGatepassCameraManager } from "./useGatepassCameraManager";
import { useGatepassRequestForm } from "./useGatepassRequestForm";
import { useGatepassHistory } from "./useGatepassHistory";

export function useGatepassPage() {
  const [recognizedRows, setRecognizedRows] = useState<RecognizedGatepassRow[]>([]);
  const [recordsError, setRecordsError] = useState("");

  const cameraManager = useGatepassCameraManager();
  const historyManager = useGatepassHistory();

  const handleSubmissionSuccess = useCallback(
    (successfulKeys: Set<string>) => {
      setRecognizedRows((current) => current.filter((row) => !successfulKeys.has(row.key)));
      void historyManager.fetchHistoryRecords();
    },
    [historyManager]
  );

  const requestForm = useGatepassRequestForm(
    recognizedRows,
    cameraManager.selectedGatepassCamera,
    handleSubmissionSuccess
  );

  const removeRecognizedPerson = useCallback((key: string) => {
    setRecognizedRows((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const summaryCounts = useMemo(
    () => ({
      recognized: recognizedRows.length,
      records: historyManager.historyRows.length,
    }),
    [recognizedRows.length, historyManager.historyRows.length]
  );

  return {
    ...cameraManager,
    ...requestForm,
    ...historyManager,
    recognizedRows,
    setRecognizedRows,
    recordsError,
    setRecordsError,
    removeRecognizedPerson,
    summaryCounts,
  };
}
