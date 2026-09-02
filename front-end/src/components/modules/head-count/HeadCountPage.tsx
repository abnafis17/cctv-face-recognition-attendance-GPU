"use client";

import HeadcountOperationsSection from "@/components/modules/head-count/HeadcountOperationsSection";
import HeadcountPageHeader from "@/components/modules/head-count/HeadcountPageHeader";
import HeadcountResultsSection from "@/components/modules/head-count/HeadcountResultsSection";
import { useHeadcountPage } from "@/hooks/useHeadcountPage";

export default function HeadcountPage() {
  const {
    activeSources,
    cams,
    canExport,
    companyId,
    counts,
    dateStr,
    dynamicHeadcountRuns,
    filteredHcRows,
    handleCameraSelect,
    handleDateChange,
    handleDepartmentChange,
    handleExport,
    handleHeadcountTypeChange,
    handleLaptopActiveChange,
    handleLineChange,
    handleRefresh,
    handleRunWindowChange,
    handleSearchChange,
    handleSearchSubmit,
    handleSectionChange,
    handleStatusFilterChange,
    handleUnitChange,
    hcRows,
    headcountType,
    hierarchy,
    hierarchyFilters,
    loading,
    offlineSources,
    otRows,
    runWindowMinutes,
    search,
    selectedCam,
    selectedCamId,
    selectedCameraActive,
    selectedCameraBusy,
    selectedCameraName,
    startCamera,
    statusFilter,
    stopCamera,
    streamType,
    totalSources,
    usingLaptopCamera,
    clearSearch,
    getRemoteStreamUrl,
  } = useHeadcountPage();

  return (
    <div className="space-y-4">
      <HeadcountPageHeader />

      <HeadcountOperationsSection
        activeSources={activeSources}
        cams={cams}
        canExport={canExport}
        companyId={companyId}
        counts={counts}
        dateStr={dateStr}
        dynamicHeadcountRunCount={dynamicHeadcountRuns.length}
        getRemoteStreamUrl={getRemoteStreamUrl}
        headcountType={headcountType}
        hierarchy={hierarchy}
        hierarchyFilters={hierarchyFilters}
        loading={loading}
        offlineSources={offlineSources}
        onCameraSelect={handleCameraSelect}
        onDateChange={handleDateChange}
        onDepartmentChange={handleDepartmentChange}
        onExport={handleExport}
        onHeadcountTypeChange={handleHeadcountTypeChange}
        onLaptopActiveChange={handleLaptopActiveChange}
        onLineChange={handleLineChange}
        onRefresh={handleRefresh}
        onRunWindowChange={handleRunWindowChange}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onSectionChange={handleSectionChange}
        onStartCamera={startCamera}
        onStatusFilterChange={handleStatusFilterChange}
        onStopCamera={stopCamera}
        onUnitChange={handleUnitChange}
        otRows={otRows}
        runWindowMinutes={runWindowMinutes}
        search={search}
        selectedCam={selectedCam}
        selectedCamId={selectedCamId}
        selectedCameraActive={selectedCameraActive}
        selectedCameraBusy={selectedCameraBusy}
        selectedCameraName={selectedCameraName}
        statusFilter={statusFilter}
        streamType={streamType}
        totalSources={totalSources}
        usingLaptopCamera={usingLaptopCamera}
        clearSearch={clearSearch}
      />

      <HeadcountResultsSection
        dateStr={dateStr}
        dynamicHeadcountRuns={dynamicHeadcountRuns}
        filteredHcRows={filteredHcRows}
        hcRowsLength={hcRows.length}
        headcountType={headcountType}
        loading={loading}
        otRows={otRows}
      />
    </div>
  );
}
