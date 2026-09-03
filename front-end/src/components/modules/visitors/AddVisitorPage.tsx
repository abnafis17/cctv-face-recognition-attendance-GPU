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
    isSubmitting, kbEnabled, activeVisitorTypes, activePurposes, idProofTypes, extraGuestsOptions,
    photoPreview, lookupAvatarUrl, isLookupEmployee, setIsLookupEmployee, lookupPhone, setLookupPhone,
    isCameraActive, setIsCameraActive, liveDetectionStatus, recognitionStatus, recognizedVisitorName,
    isExtractingFace, webcamRef, cameraDevices, selectedDeviceId, setSelectedDeviceId,
    deptSearch, setDeptSearch, hostSearch, setHostSearch, departmentOptions, hostOptions,
    handleDepartmentSelect, handleHostSelect, handleResetHostAndDepartment,
    form, handleLookup, capturePhoto, handleReset, onSubmit, departmentsList, erpEmployees, erpLoading,
  } = useAddVisitorFormState();

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Top Banner Header & Face Verification Banners */}
      <VisitorHeaderBanner
        kbEnabled={kbEnabled}
        recognitionStatus={recognitionStatus}
        recognizedVisitorName={recognizedVisitorName}
      />

      {/* Quick Lookup Bar */}
      <VisitorQuickLookup
        lookupPhone={lookupPhone}
        setLookupPhone={setLookupPhone}
        isLookupEmployee={isLookupEmployee}
        setIsLookupEmployee={setIsLookupEmployee}
        handleLookup={handleLookup}
      />

      {/* Main Grid: Form Sections (Left) & Visitor Photo (Right) */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column (2/3 width): 4 Form Sections */}
          <div className="lg:col-span-2">
            <VisitorFormSections
              form={form}
              lookupAvatarUrl={lookupAvatarUrl}
              activeVisitorTypes={activeVisitorTypes}
              activePurposes={activePurposes}
              idProofTypes={idProofTypes}
              extraGuestsOptions={extraGuestsOptions}
              departmentsList={departmentsList}
              erpEmployees={erpEmployees}
              erpLoading={erpLoading}
              departmentOptions={departmentOptions}
              hostOptions={hostOptions}
              setDeptSearch={setDeptSearch}
              setHostSearch={setHostSearch}
              handleDepartmentSelect={handleDepartmentSelect}
              handleHostSelect={handleHostSelect}
              handleResetHostAndDepartment={handleResetHostAndDepartment}
            />
          </div>

          {/* Right Column (1/3 width): Visitor Photo Panel */}
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
          <span className="text-xs text-zinc-400">Entry is time-stamped automatically on submission.</span>
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
              <CheckCircle className="h-4 w-4" /> {isSubmitting ? "Submitting..." : "Submit Entry"}
            </Button>
          </div>
        </div>
      </form>

      <VirtualKeyboard />
    </div>
  );
}
