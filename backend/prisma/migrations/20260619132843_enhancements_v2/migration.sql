-- CreateEnum
CREATE TYPE "TimeLogType" AS ENUM ('INVESTIGATION', 'DEVELOPMENT', 'TESTING', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'SUBCATEGORY_CHANGED';
ALTER TYPE "EventType" ADD VALUE 'TAG_ADDED';
ALTER TYPE "EventType" ADD VALUE 'TAG_REMOVED';
ALTER TYPE "EventType" ADD VALUE 'TIME_LOGGED';
ALTER TYPE "EventType" ADD VALUE 'DELIVERY_DATE_SET';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "correctiveAction" TEXT,
ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "noAutoClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preventiveAction" TEXT,
ADD COLUMN     "resolutionSummary" TEXT,
ADD COLUMN     "rootCause" TEXT,
ADD COLUMN     "subcategoryId" TEXT,
ADD COLUMN     "systemBrowser" TEXT,
ADD COLUMN     "systemModule" TEXT,
ADD COLUMN     "systemOs" TEXT,
ADD COLUMN     "systemProduct" TEXT,
ADD COLUMN     "systemVersion" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organization" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTag" (
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateTable
CREATE TABLE "TicketTimeLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TimeLogType" NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subcategory_categoryId_idx" ON "Subcategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_name_key" ON "Subcategory"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "TicketTag_ticketId_idx" ON "TicketTag"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTimeLog_ticketId_idx" ON "TicketTimeLog"("ticketId");

-- CreateIndex
CREATE INDEX "Ticket_subcategoryId_idx" ON "Ticket"("subcategoryId");

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTimeLog" ADD CONSTRAINT "TicketTimeLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTimeLog" ADD CONSTRAINT "TicketTimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
