-- CreateTable
CREATE TABLE "TicketRelation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketRelation_ticketId_idx" ON "TicketRelation"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRelation_ticketId_relatedId_key" ON "TicketRelation"("ticketId", "relatedId");

-- AddForeignKey
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_relatedId_fkey" FOREIGN KEY ("relatedId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
