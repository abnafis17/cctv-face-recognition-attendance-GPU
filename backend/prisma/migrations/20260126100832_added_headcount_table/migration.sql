-- AlterTable
ALTER TABLE "Camera" ADD COLUMN     "jpegQuality" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "relayAgentId" TEXT,
ADD COLUMN     "rtspUrlEnc" TEXT,
ADD COLUMN     "sendFps" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "sendHeight" INTEGER NOT NULL DEFAULT 360,
ADD COLUMN     "sendWidth" INTEGER NOT NULL DEFAULT 640,
ALTER COLUMN "rtspUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RelayAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "publicKeyPem" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelayAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairCode" (
    "code" TEXT NOT NULL,
    "companyId" TEXT,
    "agentName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Headcount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "companyId" TEXT,
    "cameraId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Headcount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelayAgent_companyId_idx" ON "RelayAgent"("companyId");

-- CreateIndex
CREATE INDEX "RelayAgent_lastSeenAt_idx" ON "RelayAgent"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelayAgent_companyId_name_key" ON "RelayAgent"("companyId", "name");

-- CreateIndex
CREATE INDEX "PairCode_companyId_idx" ON "PairCode"("companyId");

-- CreateIndex
CREATE INDEX "PairCode_expiresAt_idx" ON "PairCode"("expiresAt");

-- CreateIndex
CREATE INDEX "PairCode_agentId_idx" ON "PairCode"("agentId");

-- CreateIndex
CREATE INDEX "Headcount_companyId_timestamp_idx" ON "Headcount"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "Headcount_cameraId_timestamp_idx" ON "Headcount"("cameraId", "timestamp");

-- CreateIndex
CREATE INDEX "Headcount_employeeId_timestamp_idx" ON "Headcount"("employeeId", "timestamp");

-- CreateIndex
CREATE INDEX "Headcount_companyId_status_timestamp_idx" ON "Headcount"("companyId", "status", "timestamp");

-- CreateIndex
CREATE INDEX "Camera_relayAgentId_idx" ON "Camera"("relayAgentId");

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_relayAgentId_fkey" FOREIGN KEY ("relayAgentId") REFERENCES "RelayAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelayAgent" ADD CONSTRAINT "RelayAgent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairCode" ADD CONSTRAINT "PairCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairCode" ADD CONSTRAINT "PairCode_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "RelayAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headcount" ADD CONSTRAINT "Headcount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headcount" ADD CONSTRAINT "Headcount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headcount" ADD CONSTRAINT "Headcount_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
