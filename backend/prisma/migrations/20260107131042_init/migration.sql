-- CreateIndex
CREATE INDEX "Attendance_cameraId_idx" ON "Attendance"("cameraId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
