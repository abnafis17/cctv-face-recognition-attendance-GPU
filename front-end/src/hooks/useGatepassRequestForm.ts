import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import type { FormErrors, GatepassLeaveTypeOption, GatepassRecord, RecognizedGatepassRow } from "@/types/gatepass-types";
import { hasOpenOutRecord, normalizeApiError } from "./useGatepassUtils";

export function useGatepassRequestForm(
  recognizedRows: RecognizedGatepassRow[],
  selectedGatepassCamera: { id: string; name: string } | null,
  onSubmissionSuccess: (successfulKeys: Set<string>) => void
) {
  const [gatepassLeaveTypes, setGatepassLeaveTypes] = useState<GatepassLeaveTypeOption[]>([]);
  const [gatepassLeaveTypesLoading, setGatepassLeaveTypesLoading] = useState(false);
  const [gatepassLeaveTypesError, setGatepassLeaveTypesError] = useState("");

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [approxReturnTime, setApproxReturnTime] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaveTypes = useCallback(async () => {
    try {
      setGatepassLeaveTypesLoading(true);
      const res = await axiosInstance.get(API.GATEPASS_TYPES);
      const list = Array.isArray(res?.data?.items) ? res.data.items : Array.isArray(res?.data) ? res.data : [];
      setGatepassLeaveTypes(list);
      setGatepassLeaveTypesError("");
    } catch (err: unknown) {
      setGatepassLeaveTypesError(normalizeApiError(err, "Failed to load leave types"));
    } finally {
      setGatepassLeaveTypesLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLeaveTypes(); }, [fetchLeaveTypes]);

  const cancelGatepassFlow = useCallback(async () => {
    setLeaveTypeId("");
    setDestination("");
    setPurpose("");
    setApproxReturnTime("");
    setFormErrors({});
  }, []);

  const submitRequest = useCallback(async () => {
    if (!selectedGatepassCamera) {
      toast.error("Select a camera before submitting requests");
      return;
    }
    if (!recognizedRows.length) {
      toast.error("No recognized person found to submit");
      return;
    }

    const rowsNeedingOutSubmission = recognizedRows.filter((r) => !hasOpenOutRecord(r.latestRecord));
    const isShortLeave = leaveTypeId === "short leave";
    const isLongLeave = leaveTypeId === "Long Leave";
    const nextErrors: FormErrors = {};

    if (rowsNeedingOutSubmission.length > 0 && !leaveTypeId) {
      nextErrors.leaveType = "Select leave type";
    }
    if (rowsNeedingOutSubmission.length > 0 && (isShortLeave || isLongLeave) && !purpose) {
      nextErrors.purpose = "Purpose is required";
    }
    if (rowsNeedingOutSubmission.length > 0 && isShortLeave && !approxReturnTime.trim()) {
      nextErrors.approxReturnTime = "Approx. return time is required";
    }

    if (nextErrors.leaveType || nextErrors.purpose || nextErrors.approxReturnTime) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    let successCount = 0;
    let firstSuccessfulName = "";
    const successfulKeys = new Set<string>();
    const failedNames: string[] = [];

    const selectedPurpose = (isShortLeave || isLongLeave) && purpose
      ? (gatepassLeaveTypes.find((lt) => lt.id === purpose || lt.label.trim().toLowerCase() === purpose.trim().toLowerCase()) ?? null)
      : null;

    try {
      for (const row of recognizedRows) {
        try {
          const employeeId = row.employee.id || row.employee.employeeCode;
          const employeeName = row.employee.name || row.employee.employeeCode;

          if (hasOpenOutRecord(row.latestRecord)) {
            const res = await axiosInstance.post(`${API.GATEPASS_TABLE}/mark-return`, {
              employeeId,
              cameraId: selectedGatepassCamera.id,
              recognizedAt: row.recognizedAt.toISOString(),
            });
            if (res?.data?.updated) {
              successCount += 1;
              if (!firstSuccessfulName) firstSuccessfulName = employeeName;
              successfulKeys.add(row.key);
              continue;
            }
            failedNames.push(employeeName);
            continue;
          }

          const res = await axiosInstance.post(API.GATEPASS_TABLE, {
            employeeId,
            cameraId: selectedGatepassCamera.id,
            leaveTypeId: (isShortLeave || isLongLeave) ? (selectedPurpose?.id ?? purpose.trim()) : "Long Leave",
            leaveType: (isShortLeave || isLongLeave) ? (selectedPurpose?.label ?? purpose.trim()) : "Long Leave",
            destination: destination.trim() || null,
            purpose: (isShortLeave || isLongLeave) ? (selectedPurpose?.label ?? purpose.trim()) : "Long Leave",
            recognizedAt: row.recognizedAt.toISOString(),
            passType: isShortLeave ? "short leave" : "Long Leave",
            remarks: isShortLeave ? "okay" : "ok",
            returnTime: approxReturnTime ? parseInt(approxReturnTime, 10) : null,
          });

          const createdGatepass = res?.data?.gatepass;
          const gatePassId = createdGatepass?.externalGatepassId || res?.data?.externalApi?.responseData?.data?.[0]?.gatePassId;
          if (!gatePassId) {
            const responseMessage = res?.data?.externalApi?.responseData?.message;
            throw new Error(`Submission unsuccessful. ERP Error: (${responseMessage ?? "unknown"})`);
          }

          successCount += 1;
          if (!firstSuccessfulName) firstSuccessfulName = employeeName;
          successfulKeys.add(row.key);
        } catch (error: unknown) {
          failedNames.push(row.employee.name || row.employee.employeeCode);
          if (failedNames.length === 1) {
            toast.error(normalizeApiError(error, `Failed to submit gatepass for ${row.employee.name}.`));
          }
        }
      }

      if (successCount > 0) {
        onSubmissionSuccess(successfulKeys);
        toast.success(successCount === 1 ? `Gatepass submitted for ${firstSuccessfulName}` : `Gatepass submitted for ${successCount} people`);
        cancelGatepassFlow();
      }

      if (failedNames.length > 1) {
        toast.error(`${failedNames.length} requests failed. Retry the remaining rows.`);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedGatepassCamera,
    recognizedRows,
    leaveTypeId,
    purpose,
    approxReturnTime,
    gatepassLeaveTypes,
    destination,
    onSubmissionSuccess,
    cancelGatepassFlow,
  ]);

  return {
    gatepassLeaveTypes,
    gatepassLeaveTypesLoading,
    gatepassLeaveTypesError,
    leaveTypeId,
    setLeaveTypeId,
    destination,
    setDestination,
    purpose,
    setPurpose,
    approxReturnTime,
    setApproxReturnTime,
    formErrors,
    setFormErrors,
    submitting,
    submitRequest,
    cancelGatepassFlow,
  };
}
