-- CreateTable
CREATE TABLE "VisitorType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurposeOfVisit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurposeOfVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorType_companyId_idx" ON "VisitorType"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorType_companyId_name_key" ON "VisitorType"("companyId", "name");

-- CreateIndex
CREATE INDEX "PurposeOfVisit_companyId_idx" ON "PurposeOfVisit"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PurposeOfVisit_companyId_name_key" ON "PurposeOfVisit"("companyId", "name");

-- AddForeignKey
ALTER TABLE "VisitorType" ADD CONSTRAINT "VisitorType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurposeOfVisit" ADD CONSTRAINT "PurposeOfVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
