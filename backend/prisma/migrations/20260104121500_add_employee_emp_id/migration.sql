-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "emp_id" TEXT;

-- Backfill existing records so UI identifiers remain addressable
UPDATE "Employee" SET "emp_id" = "id" WHERE "emp_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_emp_id_key" ON "Employee"("emp_id");

-- CreateIndex
CREATE INDEX "Employee_emp_id_idx" ON "Employee"("emp_id");

