-- CreateTable
CREATE TABLE "TicketCC" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCC_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketCC_ticketId_idx" ON "TicketCC"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCC_ticketId_email_key" ON "TicketCC"("ticketId", "email");

-- AddForeignKey
ALTER TABLE "TicketCC" ADD CONSTRAINT "TicketCC_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCC" ADD CONSTRAINT "TicketCC_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
