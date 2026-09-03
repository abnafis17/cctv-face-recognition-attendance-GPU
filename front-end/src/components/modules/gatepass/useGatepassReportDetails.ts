import React from "react";
import type { GatepassRecord } from "@/types/gatepass-types";
import PakizaLogo from "@/assets/images/Pakiza_Apparels.png";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";

export function valOrDash(val: unknown): string {
  if (val === null || val === undefined) return "-";
  const str = String(val).trim();
  return str !== "" && str !== "N/A" && str !== "--" ? str : "-";
}

export function extractErpDetailRecord(resData: any): any | null {
  if (!resData || typeof resData !== "object") return null;
  let root = resData.data !== undefined ? resData.data : resData;
  if (!root || typeof root !== "object") return null;

  if ("totalCount" in root && (root.totalCount === 0 || root.data === null)) return null;
  if ("data" in root) {
    if (root.data === null || root.data === undefined) return null;
    root = root.data;
  }

  if (Array.isArray(root)) {
    if (root.length === 0) return null;
    root = root[0];
  }

  if (root && typeof root === "object" && !("error" in root)) {
    const hasKeys =
      "empName" in root ||
      "employeeName" in root ||
      "empId" in root ||
      "employeeId" in root ||
      "passTitleName" in root ||
      "organization" in root ||
      "timeStart" in root ||
      "deptName" in root ||
      "department" in root ||
      "designation" in root ||
      "remarks" in root ||
      "apWorkflowSignatureList" in root;
    if (hasKeys) return root;
  }
  return null;
}

export function useGatepassReportDetails(open: boolean, record: GatepassRecord | null) {
  const [erpDetails, setErpDetails] = React.useState<any>(null);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [noErpDataFound, setNoErpDataFound] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setErpDetails(null);
      setNoErpDataFound(false);
      return;
    }

    if (record?.id) {
      setErpDetails(null);
      setNoErpDataFound(false);
      const fetchDetails = async () => {
        try {
          setLoadingDetails(true);
          const res = await axiosInstance.get(
            `${API.GATEPASS_TABLE}/${record.id}/external-details`
          );
          const detailRecord = extractErpDetailRecord(res.data);
          if (detailRecord) {
            setErpDetails(detailRecord);
            setNoErpDataFound(false);
          } else {
            setErpDetails(null);
            setNoErpDataFound(true);
          }
        } catch (err) {
          console.error("[GatepassReportModal] External ERP details error:", err);
          setErpDetails(null);
          setNoErpDataFound(true);
        } finally {
          setLoadingDetails(false);
        }
      };
      void fetchDetails();
    }
  }, [open, record?.id]);

  const signatureList = React.useMemo(() => {
    if (!erpDetails?.apWorkflowSignatureList || !Array.isArray(erpDetails.apWorkflowSignatureList))
      return [];
    return [...erpDetails.apWorkflowSignatureList].sort((a: any, b: any) => {
      const pA = parseInt(a.priority || "0", 10);
      const pB = parseInt(b.priority || "0", 10);
      return pA - pB;
    });
  }, [erpDetails]);

  const displaySlots = React.useMemo(() => {
    if (signatureList.length > 0) {
      return signatureList.map((sig: any) => ({
        label: sig.levelName || "Approved By",
        name: valOrDash(sig.approverName),
        designation: valOrDash(sig.approverDesi),
        status: sig.approveStatus || "Pending",
        time: valOrDash(sig.approveTime),
      }));
    }
    return [];
  }, [signatureList]);

  return {
    erpDetails,
    loadingDetails,
    noErpDataFound,
    displaySlots,
  };
}
