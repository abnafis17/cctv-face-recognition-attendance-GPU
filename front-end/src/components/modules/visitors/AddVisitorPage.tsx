"use client";

import React from "react";
import { RotateCcw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VirtualKeyboard } from "@/components/reusable/VirtualKeyboard";
import { useAddVisitorFormState } from "./useAddVisitorFormState";
import { VisitorHeaderBanner } from "./VisitorHeaderBanner";
import { VisitorQuickLookup } from "./VisitorQuickLookup";
import { VisitorFormSections } from "./VisitorFormSections";
import { VisitorPhotoRightPanel } from "./VisitorPhotoRightPanel";

export default function AddVisitorPage() {
  const {
    isSubmitting, kbEnabled, setKbEnabled, activeVisitorTypes, activePurposes, idProofTypes, extraGuestsOptions,
    photoPreview, lookupAvatarUrl, isLookupEmployee, setIsLookupEmployee, lookupPhone, setLookupPhone,
    isCameraActive, setIsCameraActive, liveDetectionStatus, recognitionStatus, recognizedVisitorName,
    isExtractingFace, webcamRef, cameraDevices, selectedDeviceId, setSelectedDeviceId,
    deptSearch, setDeptSearch, hostSearch, setHostSearch, departmentOptions, hostOptions,
    handleHostSelect, handleResetHostAndDepartment,
    visitorPassPlaceholder,
    form, handleLookup, capturePhoto, handleReset, onSubmit, erpLoading,
  } = useAddVisitorFormState();

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Top Banner Header & Face Verification Banners */}
      <VisitorHeaderBanner
        kbEnabled={kbEnabled}
        setKbEnabled={setKbEnabled}
        recognitionStatus={recognitionStatus}
        recognizedVisitorName={recognizedVisitorName}
      />

      {/* Main Grid: Form Sections (Left 3/4) & Visitor Photo (Right 1/4) */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Left Columns (3/4 width) */}
          <div className="space-y-6 lg:col-span-3">
            {/* Quick Lookup Bar */}
            <VisitorQuickLookup
              lookupPhone={lookupPhone}
              setLookupPhone={setLookupPhone}
              isLookupEmployee={isLookupEmployee}
              setIsLookupEmployee={setIsLookupEmployee}
              handleLookup={handleLookup}
            />

            {/* 4 Form Sections */}
            <VisitorFormSections
              form={form}
              lookupAvatarUrl={lookupAvatarUrl}
              recognitionStatus={recognitionStatus}
              activeVisitorTypes={activeVisitorTypes}
              activePurposes={activePurposes}
              idProofTypes={idProofTypes}
              extraGuestsOptions={extraGuestsOptions}
              visitorPassPlaceholder={visitorPassPlaceholder}
              departmentOptions={departmentOptions}
              hostOptions={hostOptions}
              erpLoading={erpLoading}
              setDeptSearch={setDeptSearch}
              setHostSearch={setHostSearch}
              handleHostSelect={handleHostSelect}
              handleResetHostAndDepartment={handleResetHostAndDepartment}
            />
          </div>

          {/* Right Column (1/4 width): Visitor Photo Panel */}
          <div className="lg:col-span-1">
            <VisitorPhotoRightPanel
              isCameraActive={isCameraActive}
              setIsCameraActive={setIsCameraActive}
              photoPreview={photoPreview}
              liveDetectionStatus={liveDetectionStatus}
              isExtractingFace={isExtractingFace}
              webcamRef={webcamRef}
              capturePhoto={capturePhoto}
              cameraDevices={cameraDevices}
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              hasPhotoError={!!form.formState.errors.visitorPhoto}
              photoErrorMessage={form.formState.errors.visitorPhoto?.message}
            />
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-200/80 pt-5">
          <span className="text-xs text-zinc-400">
            Entry is time-stamped automatically on submission.
          </span>
          <div className="flex w-full sm:w-auto items-center gap-3">
            <Button
              type="button"
              onClick={() => handleReset(true)}
              className="h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-[#0c1b33] px-6 text-sm font-semibold text-white hover:bg-[#11274c] flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <CheckCircle className="h-4 w-4" />{" "}
              {isSubmitting ? "Submitting..." : "Submit Entry"}
            </Button>
          </div>
        </div>
      </form>

      <VirtualKeyboard />
    </div>
  );
}

