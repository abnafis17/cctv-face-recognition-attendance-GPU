-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "emailAddress" TEXT,
    "companyAddress" TEXT NOT NULL,
    "visitorType" TEXT NOT NULL,
    "purposeOfVisit" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "hostEmployeeId" TEXT NOT NULL,
    "idProofType" TEXT NOT NULL,
    "idProofNumber" TEXT,
    "vehicleNumber" TEXT,
    "extraGuest" TEXT,
    "visitorPassNo" TEXT NOT NULL,
    "dateOfVisit" TEXT NOT NULL,
    "timeIn" TEXT NOT NULL,
    "entryAuthorizedBy" TEXT,
    "remarks" TEXT,
    "visitorPhoto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_companyId_idx" ON "Visitor"("companyId");

-- CreateIndex
CREATE INDEX "Visitor_contactNumber_idx" ON "Visitor"("contactNumber");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
