"use client";

import GatepassHeader from "./GatepassHeader";
import GatepassCameraSection from "./GatepassCameraSection";
import RecognizedPersonsSection from "./RecognizedPersonsSection";
import GatepassSubmissionSection from "./GatepassSubmissionSection";
import GatepassHistorySection from "./GatepassHistorySection";
import GatepassReportModal from "./GatepassReportModal";
import { useGatepassPage } from "@/hooks/useGatepassPage";

export default function GatepassPage() {
  const gatepass = useGatepassPage();

  return (
    <div className="flex w-full flex-col gap-4">
      <GatepassHeader
        recognizedCount={gatepass.summaryCounts.recognized}
        recordsCount={gatepass.summaryCounts.records}
        isCameraRunning={gatepass.isSelectedCameraRunning}
      />

      <div className="flex flex-col gap-4 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch w-full min-h-0 min-w-0">
          
          {/* Left Column - Camera Monitor & Request Form */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-4 min-w-0">
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
              approxReturnTime={gatepass.approxReturnTime}
              formErrors={gatepass.formErrors}
              submitting={gatepass.submitting}
              setLeaveTypeId={gatepass.setLeaveTypeId}
              setDestination={gatepass.setDestination}
              setPurpose={gatepass.setPurpose}
              setApproxReturnTime={gatepass.setApproxReturnTime}
              setFormErrors={gatepass.setFormErrors}
              onSubmit={gatepass.submitRequest}
              onCancel={gatepass.cancelGatepassFlow}
            />
          </div>

          {/* Right Column - Queue */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-4 min-w-0 h-full">
            <RecognizedPersonsSection
              rows={gatepass.recognizedRows}
              recordsError={gatepass.recordsError}
              isSelectedCameraRunning={gatepass.isSelectedCameraRunning}
              onRemove={gatepass.removeRecognizedPerson}
            />
          </div>
        </div>

        {/* Bottom Full Width - History Log */}
        <div className="w-full min-w-0">
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
      <GatepassReportModal
        open={gatepass.isReportModalOpen}
        onClose={() => gatepass.setIsReportModalOpen(false)}
        record={gatepass.selectedReportRecord}
      />
    </div>
  );
}
