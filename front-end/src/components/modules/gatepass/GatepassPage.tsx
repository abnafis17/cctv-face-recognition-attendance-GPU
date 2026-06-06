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
        <div className="grid min-h-0 min-w-0 flex-none grid-cols-1 xl:h-[clamp(320px,40vh,500px)] xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] xl:overflow-hidden">
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

          <section className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-t border-zinc-100 bg-white xl:border-t-0">
            <RecognizedPersonsSection
              rows={gatepass.recognizedRows}
              columns={gatepass.recognizedColumns}
              recordsError={gatepass.recordsError}
              isSelectedCameraRunning={gatepass.isSelectedCameraRunning}
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
          </section>
        </div>

        <GatepassHistorySection
          historyRows={gatepass.historyRows}
          paginatedHistoryRows={gatepass.paginatedHistoryRows}
          historyColumns={gatepass.historyColumns}
          historyLoading={gatepass.historyLoading}
          historyPaginationResetKey={gatepass.historyPaginationResetKey}
          historySearch={gatepass.historySearch}
          historyFromDate={gatepass.historyFromDate}
          historyToDate={gatepass.historyToDate}
          historyLeaveTypeId={gatepass.historyLeaveTypeId}
          gatepassLeaveTypes={gatepass.gatepassLeaveTypes}
          historyError={gatepass.historyError}
          setHistorySearch={gatepass.setHistorySearch}
          setHistoryFromDate={gatepass.setHistoryFromDate}
          setHistoryToDate={gatepass.setHistoryToDate}
          setHistoryLeaveTypeId={gatepass.setHistoryLeaveTypeId}
          setHistoryPage={gatepass.setHistoryPage}
          resetHistoryFilters={gatepass.resetHistoryFilters}
          fetchHistoryRecords={gatepass.fetchHistoryRecords}
          pageLimit={gatepass.pageLimit}
        />
      </div>
    </div>
  );
}
