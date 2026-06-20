-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "escalatedById" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_ticketId_key" ON "Escalation"("ticketId");

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
