import { memo } from "react";
import { AI_HOST } from "@/config/axiosInstance";

const HeadcountPageHeader = memo(function HeadcountPageHeader() {
  return (
    <header className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <h1 className="page-title">Headcount Operations</h1>
      <p className="page-subtitle">
        Live headcount capture, camera monitoring, and cross-check reporting.
      </p>
      <p className="page-meta">AI Host: {AI_HOST}</p>
    </header>
  );
});

HeadcountPageHeader.displayName = "HeadcountPageHeader";

export default HeadcountPageHeader;
