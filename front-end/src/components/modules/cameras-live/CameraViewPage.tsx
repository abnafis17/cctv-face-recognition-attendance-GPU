"use client";

import { AnimatePresence, motion } from "framer-motion";
import LocalCamera from "@/components/CameraComponent";
import CameraViewHeader from "@/components/modules/cameras-live/CameraViewHeader";
import CameraMonitorCard from "@/components/modules/cameras-live/CameraMonitorCard";
import { useCameraViewPage } from "@/hooks/useCameraViewPage";
import { cn } from "@/lib/utils";

const FULLSCREEN_CARD_CLASS_NAME =
  "fixed inset-4 z-[70] rounded-md shadow-2xl ring-1 ring-white/10";

export default function CameraViewPage() {
  const {
    actionCamId,
    activeScreens,
    attendanceActionCamId,
    attendanceEnabledByCamId,
    cameraSortOrder,
    cameraWallClassName,
    cameraWallRef,
    cameraWallStyle,
    closeFullscreen,
    companyId,
    err,
    fullscreenCardId,
    getStreamUrl,
    handleDisableAttendance,
    handleEnableAttendance,
    handleLaptopActiveChange,
    laptopCameraId,
    laptopCardId,
    offlineScreens,
    shouldFillViewportGrid,
    sortedCams,
    startCamera,
    stopCamera,
    toggleCameraSortOrder,
    toggleFullscreen,
    totalScreens,
  } = useCameraViewPage();

  const cameraWallItemClassName = cn(
    "camera-wall-item",
    shouldFillViewportGrid && "h-full",
  );
  const getCardClassName = (isFullscreen: boolean) =>
    cn(
      shouldFillViewportGrid && "h-full",
      "transition-all duration-300 ease-out",
      isFullscreen && FULLSCREEN_CARD_CLASS_NAME,
    );
  const laptopIsFullscreen = fullscreenCardId === laptopCardId;
  const laptopCard = (
    <div className={cameraWallItemClassName}>
      <LocalCamera
        userId={laptopCameraId}
        companyId={companyId || ""}
        cameraName="Laptop Camera"
        isFullscreen={laptopIsFullscreen}
        fillContainer={shouldFillViewportGrid}
        onScreenDoubleClick={() => toggleFullscreen(laptopCardId)}
        onActiveChange={handleLaptopActiveChange}
        className={getCardClassName(laptopIsFullscreen)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <CameraViewHeader
        totalScreens={totalScreens}
        activeScreens={activeScreens}
        offlineScreens={offlineScreens}
        cameraSortOrder={cameraSortOrder}
        onToggleCameraSortOrder={toggleCameraSortOrder}
      />

      {err ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <AnimatePresence>
        {fullscreenCardId ? (
          <motion.button
            type="button"
            aria-label="Exit full screen camera"
            className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-[1.5px]"
            onClick={closeFullscreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      <section
        ref={cameraWallRef}
        className={cameraWallClassName}
        // className={"grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4"}
        style={cameraWallStyle}
      >
        {cameraSortOrder === "desc" ? laptopCard : null}

        {sortedCams.map((camera) => {
          const cardId = `camera:${camera.id}`;
          const isFullscreen = fullscreenCardId === cardId;
          const attendanceEnabled =
            attendanceEnabledByCamId[camera.id] ?? Boolean(camera.attendance);

          return (
            <div key={camera.id} className={cameraWallItemClassName}>
              <CameraMonitorCard
                camera={camera}
                streamUrl={getStreamUrl(
                  camera,
                  isFullscreen ? "focus" : "grid",
                )}
                busy={actionCamId === camera.id}
                attendanceEnabled={attendanceEnabled}
                attendanceBusy={attendanceActionCamId === camera.id}
                isFullscreen={isFullscreen}
                fillContainer={shouldFillViewportGrid}
                onScreenDoubleClick={() => toggleFullscreen(cardId)}
                className={getCardClassName(isFullscreen)}
                onStart={startCamera}
                onStop={stopCamera}
                onEnableAttendance={handleEnableAttendance}
                onDisableAttendance={handleDisableAttendance}
              />
            </div>
          );
        })}

        {cameraSortOrder === "asc" ? laptopCard : null}
      </section>
    </div>
  );
}
