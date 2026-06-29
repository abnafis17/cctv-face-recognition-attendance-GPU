"use client";

import GatepassHeader from "./GatepassHeader";
import GatepassCameraSection from "./GatepassCameraSection";
import RecognizedPersonsSection from "./RecognizedPersonsSection";
import GatepassSubmissionSection from "./GatepassSubmissionSection";
import GatepassHistorySection from "./GatepassHistorySection";
import { useGatepassPage } from "@/hooks/useGatepassPage";

export default function GatepassPage() {
  const gatepass = useGatepassPage();

  return (
    <div className="ui-readable flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-[24px] border border-zinc-100 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] md:rounded-[28px]">
      <GatepassHeader
        recognizedCount={gatepass.summaryCounts.recognized}
        recordsCount={gatepass.summaryCounts.records}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <GatepassCameraSection
          selectedGatepassCameraId={gatepass.selectedGatepassCameraId}
          gatepassCameras={gatepass.gatepassCameras}
          gatepassCamerasLoading={gatepass.gatepassCamerasLoading}
          cameraAction={gatepass.cameraAction}
          submitting={gatepass.submitting}
          selectedGatepassCamera={gatepass.selectedGatepassCamera}
          previewCamera={gatepass.previewCamera}
          recognitionStreamUrl={gatepass.recognitionStreamUrl}
          isSelectedCameraRunning={gatepass.isSelectedCameraRunning}
          gatepassCameraError={gatepass.gatepassCameraError}
          directoryError={gatepass.directoryError}
          panelError={gatepass.panelError}
          onCameraChange={gatepass.handleCameraChange}
          onStart={gatepass.startSelectedCamera}
          onStop={gatepass.stopSelectedCamera}
        />

        <GatepassSubmissionSection
          recognizedRows={gatepass.recognizedRows}
          gatepassLeaveTypes={gatepass.gatepassLeaveTypes}
          gatepassLeaveTypesLoading={gatepass.gatepassLeaveTypesLoading}
          gatepassLeaveTypesError={gatepass.gatepassLeaveTypesError}
          leaveTypeId={gatepass.leaveTypeId}
          destination={gatepass.destination}
          purpose={gatepass.purpose}
          formErrors={gatepass.formErrors}
          submitting={gatepass.submitting}
          setLeaveTypeId={gatepass.setLeaveTypeId}
          setDestination={gatepass.setDestination}
          setPurpose={gatepass.setPurpose}
          setFormErrors={gatepass.setFormErrors}
          onSubmit={gatepass.submitRequest}
        />

        <RecognizedPersonsSection
          rows={gatepass.recognizedRows}
          columns={gatepass.recognizedColumns}
          recordsError={gatepass.recordsError}
          isSelectedCameraRunning={gatepass.isSelectedCameraRunning}
        />

        <GatepassHistorySection
          historyRows={gatepass.historyRows}
          paginatedHistoryRows={gatepass.paginatedHistoryRows}
          historyColumns={gatepass.historyColumns}
          historyLoading={gatepass.historyLoading}
          historyPaginationResetKey={gatepass.historyPaginationResetKey}
          historySearch={gatepass.historySearch}
          historyFromDate={gatepass.historyFromDate}
          historyToDate={gatepass.historyToDate}
          historyLeaveTypeCategory={gatepass.historyLeaveTypeCategory}
          historyPurposeId={gatepass.historyPurposeId}
          gatepassLeaveTypes={gatepass.gatepassLeaveTypes}
          historyError={gatepass.historyError}
          setHistorySearch={gatepass.setHistorySearch}
          setHistoryFromDate={gatepass.setHistoryFromDate}
          setHistoryToDate={gatepass.setHistoryToDate}
          setHistoryLeaveTypeCategory={gatepass.setHistoryLeaveTypeCategory}
          setHistoryPurposeId={gatepass.setHistoryPurposeId}
          setHistoryPage={gatepass.setHistoryPage}
          resetHistoryFilters={gatepass.resetHistoryFilters}
          fetchHistoryRecords={gatepass.fetchHistoryRecords}
          pageLimit={gatepass.pageLimit}
        />
      </div>
    </div>
  );
}
