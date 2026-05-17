import { ImapIngestService, InboundEmailData } from './imap-ingest.service';

const mockTicketsService = {
  createFromEmail: jest.fn(),
  appendFromEmail: jest.fn(),
};

const mockPrisma = {
  setting: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  processedEmail: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  },
};

function makeService() {
  return new ImapIngestService(
    mockPrisma as any,
    mockTicketsService as any,
  );
}

const BASE_EMAIL: InboundEmailData = {
  messageId: 'msg-001@test',
  fromEmail: 'customer@example.com',
  fromName: 'Test Customer',
  subject: 'Cannot log in',
  body: 'I get a 500 error on the login page.',
  isAutoReply: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.processedEmail.findUnique.mockResolvedValue(null); // no dup by default
});

describe('ImapIngestService.processEmailMessage', () => {
  describe('duplicate detection', () => {
    it('returns DUPLICATE when messageId already in ProcessedEmail', async () => {
      mockPrisma.processedEmail.findUnique.mockResolvedValue({ id: '1', messageId: BASE_EMAIL.messageId });

      const svc = makeService();
      const result = await svc.processEmailMessage(BASE_EMAIL);

      expect(result.outcome).toBe('DUPLICATE');
      expect(mockTicketsService.createFromEmail).not.toHaveBeenCalled();
      expect(mockPrisma.processedEmail.create).not.toHaveBeenCalled();
    });

    it('does not create a duplicate ticket for the same messageId', async () => {
      mockPrisma.processedEmail.findUnique
        .mockResolvedValueOnce(null)           // first call: not a dup → create
        .mockResolvedValueOnce({ id: '1' });   // second call: is a dup → skip

      mockTicketsService.createFromEmail.mockResolvedValue({ ticketId: 'tid-1', messageId: 'mid-1' });

      const svc = makeService();
      await svc.processEmailMessage(BASE_EMAIL);
      const second = await svc.processEmailMessage(BASE_EMAIL);

      expect(second.outcome).toBe('DUPLICATE');
      expect(mockTicketsService.createFromEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-reply filtering', () => {
    it('returns IGNORED and records ProcessedEmail for auto-reply', async () => {
      const svc = makeService();
      const result = await svc.processEmailMessage({ ...BASE_EMAIL, isAutoReply: true });

      expect(result.outcome).toBe('IGNORED');
      expect(mockPrisma.processedEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ outcome: 'IGNORED' }) }),
      );
      expect(mockTicketsService.createFromEmail).not.toHaveBeenCalled();
    });
  });

  describe('missing sender', () => {
    it('returns IGNORED when fromEmail is empty', async () => {
      const svc = makeService();
      const result = await svc.processEmailMessage({ ...BASE_EMAIL, fromEmail: '' });

      expect(result.outcome).toBe('IGNORED');
      expect(mockTicketsService.createFromEmail).not.toHaveBeenCalled();
    });
  });

  describe('new ticket creation', () => {
    it('calls createFromEmail and returns CREATED_TICKET for plain email', async () => {
      mockTicketsService.createFromEmail.mockResolvedValue({
        ticketId: 'tid-abc',
        messageId: 'mid-abc',
      });

      const svc = makeService();
      const result = await svc.processEmailMessage(BASE_EMAIL);

      expect(result.outcome).toBe('CREATED_TICKET');
      expect(result.ticketId).toBe('tid-abc');
      expect(mockTicketsService.createFromEmail).toHaveBeenCalledWith(
        'customer@example.com',
        'Test Customer',
        'Cannot log in',
        expect.any(String), // description
        'msg-001@test',
        undefined,          // category (not parsed from body)
        undefined,          // priority
      );
    });

    it('passes parsed category and priority to createFromEmail', async () => {
      mockTicketsService.createFromEmail.mockResolvedValue({ ticketId: 't1', messageId: 'm1' });

      const svc = makeService();
      await svc.processEmailMessage({
        ...BASE_EMAIL,
        subject: '[HELPDESK] App crash',
        body: 'Category: Technical\nPriority: URGENT\n\nApp crashes on startup.',
      });

      expect(mockTicketsService.createFromEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'App crash',       // prefix stripped
        'App crashes on startup.',
        expect.any(String),
        'Technical',
        'URGENT',
      );
    });

    it('records outcome in ProcessedEmail after creation', async () => {
      mockTicketsService.createFromEmail.mockResolvedValue({ ticketId: 't2', messageId: 'm2' });

      const svc = makeService();
      await svc.processEmailMessage(BASE_EMAIL);

      expect(mockPrisma.processedEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageId: BASE_EMAIL.messageId,
            outcome: 'CREATED_TICKET',
            ticketId: 't2',
          }),
        }),
      );
    });
  });

  describe('append to existing ticket', () => {
    it('calls appendFromEmail when subject contains [HD-XXXXXX] reference', async () => {
      mockTicketsService.appendFromEmail.mockResolvedValue({
        ticketId: 'tid-existing',
        messageId: 'mid-new',
      });

      const svc = makeService();
      const result = await svc.processEmailMessage({
        ...BASE_EMAIL,
        subject: 'Re: [HD-000042] Cannot log in',
        body: 'Still having issues.',
      });

      expect(result.outcome).toBe('APPENDED');
      expect(result.ticketId).toBe('tid-existing');
      expect(mockTicketsService.appendFromEmail).toHaveBeenCalledWith(
        'HD-000042',
        'customer@example.com',
        'Still having issues.',
        BASE_EMAIL.messageId,
      );
    });

    it('returns IGNORED when reference not found in DB', async () => {
      mockTicketsService.appendFromEmail.mockResolvedValue(null);

      const svc = makeService();
      const result = await svc.processEmailMessage({
        ...BASE_EMAIL,
        subject: 'Re: [HD-999999] Unknown ticket',
        body: 'Some reply.',
      });

      expect(result.outcome).toBe('IGNORED');
    });

    it('reference matching is case-insensitive', async () => {
      mockTicketsService.appendFromEmail.mockResolvedValue({ ticketId: 't3', messageId: 'm3' });

      const svc = makeService();
      await svc.processEmailMessage({
        ...BASE_EMAIL,
        subject: 'Re: [hd-000007] some subject',
        body: 'A reply.',
      });

      expect(mockTicketsService.appendFromEmail).toHaveBeenCalledWith(
        'HD-000007',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });
});
