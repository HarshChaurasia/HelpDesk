import { TicketsService } from './tickets.service';
import { TicketStatus, Priority, MessageType, Channel, Role } from '@prisma/client';

// ---- minimal mocks ----

const mockUser = {
  id: 'user-customer-1',
  email: 'customer@example.com',
  fullName: 'Test Customer',
  role: Role.CUSTOMER,
  isActive: true,
  passwordHash: 'hash',
  notifPref: 'BOTH' as any,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTicket = {
  id: 'ticket-1',
  reference: 'HD-000001',
  subject: 'Cannot log in',
  status: TicketStatus.NEW,
  priority: Priority.MEDIUM,
  channel: Channel.EMAIL,
  categoryId: null,
  createdById: mockUser.id,
  assignedToId: null,
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  slaResponseDueAt: new Date(),
  slaResolutionDueAt: new Date(),
  slaBreached: false,
  lastCustomerActivityAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  watchers: [],
  messages: [{ id: 'msg-1' }],
};

const mockEventBus = { emit: jest.fn() };

function makePrisma(overrides: Partial<Record<string, any>> = {}) {
  return {
    counter: {
      upsert: jest.fn().mockResolvedValue({ value: 1 }),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(mockUser),
      create: jest.fn().mockResolvedValue(mockUser),
    },
    ticket: {
      create: jest.fn().mockResolvedValue(mockTicket),
      findUnique: jest.fn().mockResolvedValue(mockTicket),
      update: jest.fn().mockResolvedValue(mockTicket),
    },
    ticketEvent: { create: jest.fn().mockResolvedValue({}) },
    ticketWatcher: { upsert: jest.fn().mockResolvedValue({}) },
    message: { create: jest.fn().mockResolvedValue({ id: 'new-msg-1' }) },
    ...overrides,
  };
}

function makeService(prismaOverrides: Partial<Record<string, any>> = {}) {
  return new TicketsService(makePrisma(prismaOverrides) as any, mockEventBus as any);
}

beforeEach(() => jest.clearAllMocks());

// ----------------------------------------------------------------
describe('TicketsService.createFromEmail', () => {
  it('creates a new ticket using the customer account', async () => {
    const svc = makeService();
    const result = await svc.createFromEmail(
      'customer@example.com',
      'Test Customer',
      'Cannot log in',
      'Error 500 on login page.',
      'msg-id-001',
    );
    expect(result.ticketId).toBe('ticket-1');
    expect(result.messageId).toBe('msg-1');
  });

  it('auto-provisions a new customer if email not found', async () => {
    const newUser = { ...mockUser, id: 'user-new' };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue(null), // not found
        create: jest.fn().mockResolvedValue(newUser),
      },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    await svc.createFromEmail('new@example.com', 'New Person', 'Subject', 'Body', 'msg-002');

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new@example.com', role: 'CUSTOMER' }),
      }),
    );
  });

  it('uses existing customer when email already registered', async () => {
    const prisma = makePrisma();
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    await svc.createFromEmail('customer@example.com', 'Test Customer', 'Subject', 'Body', 'msg-003');

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('resolves categoryId when categoryName matches an active category', async () => {
    const category = { id: 'cat-tech', name: 'Technical', isActive: true, slaPolicyId: null };
    const prisma = makePrisma({
      category: {
        findFirst: jest.fn().mockResolvedValue(category),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    await svc.createFromEmail('c@x.com', 'C', 'Subject', 'Body', 'msg-004', 'Technical', 'HIGH');

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-tech', priority: 'HIGH' }),
      }),
    );
  });

  it('ignores unknown category name (falls back to null)', async () => {
    const prisma = makePrisma({
      category: {
        findFirst: jest.fn().mockResolvedValue(null), // not found
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    await svc.createFromEmail('c@x.com', 'C', 'Subject', 'Body', 'msg-005', 'NonExistent');

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: null }),
      }),
    );
  });

  it('emits CREATED domain event', async () => {
    const svc = makeService();
    await svc.createFromEmail('c@x.com', 'C', 'Subject', 'Body', 'msg-006');
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'ticket.event',
      expect.objectContaining({ type: 'CREATED' }),
    );
  });
});

// ----------------------------------------------------------------
describe('TicketsService.appendFromEmail', () => {
  it('appends a message to an existing ticket', async () => {
    const svc = makeService();
    const result = await svc.appendFromEmail(
      'HD-000001',
      'customer@example.com',
      'Still broken after restart.',
      'msg-reply-001',
    );
    expect(result).not.toBeNull();
    expect(result?.ticketId).toBe('ticket-1');
  });

  it('returns null when reference does not match any ticket', async () => {
    const prisma = makePrisma({
      ticket: { ...makePrisma().ticket, findUnique: jest.fn().mockResolvedValue(null) },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    const result = await svc.appendFromEmail('HD-999999', 'c@x.com', 'Body', 'msg-007');
    expect(result).toBeNull();
  });

  it('reopens a RESOLVED ticket when the original customer replies', async () => {
    const resolvedTicket = {
      ...mockTicket,
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date(),
      createdById: mockUser.id,
    };
    const prisma = makePrisma({
      ticket: {
        findUnique: jest.fn().mockResolvedValue(resolvedTicket),
        update: jest.fn().mockResolvedValue({ ...resolvedTicket, status: TicketStatus.REOPENED }),
      },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    // sender is the original customer
    await svc.appendFromEmail('HD-000001', mockUser.email, 'Still not working.', 'msg-reopen');

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TicketStatus.REOPENED }),
      }),
    );
  });

  it('does NOT reopen a RESOLVED ticket when a different user replies', async () => {
    const resolvedTicket = { ...mockTicket, status: TicketStatus.RESOLVED, createdById: 'other-user' };
    const differentUser = { ...mockUser, id: 'agent-1', email: 'agent@example.com' };
    const prisma = makePrisma({
      ticket: {
        findUnique: jest.fn().mockResolvedValue(resolvedTicket),
        update: jest.fn().mockResolvedValue(resolvedTicket),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(differentUser),
        create: jest.fn(),
      },
    });
    const svc = new TicketsService(prisma as any, mockEventBus as any);

    await svc.appendFromEmail('HD-000001', 'agent@example.com', 'Agent reply.', 'msg-agent');

    const updateCall = prisma.ticket.update.mock.calls[0][0];
    expect(updateCall.data.status).toBeUndefined();
  });

  it('emits MESSAGE_ADDED domain event after append', async () => {
    const svc = makeService();
    await svc.appendFromEmail('HD-000001', 'customer@example.com', 'Follow-up.', 'msg-008');
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'ticket.event',
      expect.objectContaining({ type: 'MESSAGE_ADDED' }),
    );
  });
});
