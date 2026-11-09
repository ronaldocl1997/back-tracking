-- AlterEnum
ALTER TYPE "RouteRunStatus" ADD VALUE 'NOT_STARTED';

-- AlterTable
ALTER TABLE "LocationPing" ADD COLUMN     "clientPingId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "RouteRun" ADD COLUMN     "lastAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "lastLatitude" DOUBLE PRECISION,
ADD COLUMN     "lastLongitude" DOUBLE PRECISION,
ADD COLUMN     "lastPingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_driverId_clientPingId_key" ON "LocationPing"("driverId", "clientPingId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

