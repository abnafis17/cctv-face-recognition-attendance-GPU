"use client";

type ExportXlsxOptions = {
  data: Record<string, unknown>[];
  fileName: string;
  sheetName?: string;
};

function safeFileName(name: string) {
  const trimmed = name.trim() || "export";
  const withoutBadChars = trimmed.replace(/[\\/:*?"<>|]+/g, "_");
  return withoutBadChars.endsWith(".xlsx") ? withoutBadChars : `${withoutBadChars}.xlsx`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportJsonToXlsx({ data, fileName, sheetName }: ExportXlsxOptions) {
  const safeName = safeFileName(fileName);
  const xlsx = await import("xlsx");

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(data);
  xlsx.utils.book_append_sheet(workbook, worksheet, sheetName ?? "Sheet1");

  const arrayBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(blob, safeName);
}

