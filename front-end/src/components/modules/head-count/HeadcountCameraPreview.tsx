"use client";

import { memo } from "react";
import HeadCountCameraComponent from "@/components/modules/head-count/HeadCountCameraComponent";
import HeadcountRemoteCameraPreview from "@/components/modules/head-count/HeadcountRemoteCameraPreview";
import type { HeadcountCameraOption } from "@/types/headcount-types";

type HeadcountCameraPreviewProps = {
  companyId: string;
  getRemoteStreamUrl: (camera: HeadcountCameraOption) => string;
  laptopCameraId: string;
  onLaptopActiveChange: (active: boolean) => void;
  onStartCamera: (cameraId: string) => void;
  onStopCamera: (cameraId: string) => void;
  selectedCam: HeadcountCameraOption | null;
  selectedCameraBusy: boolean;
  streamType: string;
  usingLaptopCamera: boolean;
};

const HeadcountCameraPreview = memo(function HeadcountCameraPreview({
  companyId,
  getRemoteStreamUrl,
  laptopCameraId,
  onLaptopActiveChange,
  onStartCamera,
  onStopCamera,
  selectedCam,
  selectedCameraBusy,
  streamType,
  usingLaptopCamera,
}: HeadcountCameraPreviewProps) {
  if (usingLaptopCamera) {
    return (
      <HeadCountCameraComponent
        userId={laptopCameraId}
        companyId={companyId}
        cameraName="Laptop Camera"
        streamType={streamType}
        onActiveChange={onLaptopActiveChange}
        className="mx-auto w-full max-w-[500px] xl:h-full"
        fillHeight
      />
    );
  }

  if (!selectedCam) return null;

  return (
    <HeadcountRemoteCameraPreview
      camera={selectedCam}
      streamUrl={getRemoteStreamUrl(selectedCam)}
      busy={selectedCameraBusy}
      onStart={onStartCamera}
      onStop={onStopCamera}
      className="mx-auto w-full max-w-[500px] xl:h-full"
      fillHeight
    />
  );
});

HeadcountCameraPreview.displayName = "HeadcountCameraPreview";

export default HeadcountCameraPreview;
