-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "unit" TEXT;

-- CreateIndex
CREATE INDEX "Employee_companyId_unit_idx" ON "Employee"("companyId", "unit");
