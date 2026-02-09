-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "department" TEXT,
ADD COLUMN     "line" TEXT,
ADD COLUMN     "section" TEXT;

-- CreateTable
CREATE TABLE "OtRequisition" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "companyId" TEXT,
    "cameraId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtRequisition_companyId_timestamp_idx" ON "OtRequisition"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "OtRequisition_cameraId_timestamp_idx" ON "OtRequisition"("cameraId", "timestamp");

-- CreateIndex
CREATE INDEX "OtRequisition_employeeId_timestamp_idx" ON "OtRequisition"("employeeId", "timestamp");

-- CreateIndex
CREATE INDEX "Employee_companyId_section_idx" ON "Employee"("companyId", "section");

-- CreateIndex
CREATE INDEX "Employee_companyId_department_idx" ON "Employee"("companyId", "department");

-- CreateIndex
CREATE INDEX "Employee_companyId_line_idx" ON "Employee"("companyId", "line");

-- AddForeignKey
ALTER TABLE "OtRequisition" ADD CONSTRAINT "OtRequisition_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtRequisition" ADD CONSTRAINT "OtRequisition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtRequisition" ADD CONSTRAINT "OtRequisition_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
