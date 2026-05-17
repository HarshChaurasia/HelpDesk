import { TicketStatus } from '@prisma/client';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
  OPEN: ['IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['PENDING_CUSTOMER', 'RESOLVED', 'OPEN', 'CLOSED'],
  PENDING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['REOPENED', 'CLOSED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  CLOSED: ['REOPENED'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNext(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}
