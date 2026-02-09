-- AlterTable
ALTER TABLE "Camera" ADD COLUMN "cam_id" TEXT;

-- Backfill existing records so previous IDs remain addressable
UPDATE "Camera" SET "cam_id" = "id" WHERE "cam_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Camera_cam_id_key" ON "Camera"("cam_id");

-- CreateIndex
CREATE INDEX "Camera_cam_id_idx" ON "Camera"("cam_id");

