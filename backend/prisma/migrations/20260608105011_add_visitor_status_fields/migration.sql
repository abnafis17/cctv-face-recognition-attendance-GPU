-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'checked_in',
ADD COLUMN     "timeOut" TEXT;
