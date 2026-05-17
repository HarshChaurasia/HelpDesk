import { parseEmail, parseEmailBody, parseEmailSubject } from './email-parser';

describe('parseEmailSubject', () => {
  it('strips [HELPDESK] prefix', () => {
    expect(parseEmailSubject('[HELPDESK] Cannot log in')).toBe('Cannot log in');
  });

  it('strips prefix case-insensitively', () => {
    expect(parseEmailSubject('[helpdesk] Some issue')).toBe('Some issue');
  });

  it('returns subject unchanged if no prefix', () => {
    expect(parseEmailSubject('Invoice question')).toBe('Invoice question');
  });
});

describe('parseEmailBody', () => {
  it('extracts category and priority before blank line', () => {
    const body = 'Category: Technical\nPriority: HIGH\n\nI cannot log in.';
    const result = parseEmailBody(body);
    expect(result.category).toBe('Technical');
    expect(result.priority).toBe('HIGH');
    expect(result.description).toBe('I cannot log in.');
  });

  it('extracts fields before --- separator', () => {
    const body = 'Category: Billing\nPriority: MEDIUM\n---\nI was charged twice.';
    const result = parseEmailBody(body);
    expect(result.category).toBe('Billing');
    expect(result.priority).toBe('MEDIUM');
    expect(result.description).toBe('I was charged twice.');
  });

  it('extracts delivery date field', () => {
    const body = 'Category: General\nDelivery: 2026-06-01\n\nPlease fix ASAP.';
    const result = parseEmailBody(body);
    expect(result.deliveryDate).toBe('2026-06-01');
  });

  it('maps priority aliases: critical → URGENT, normal → MEDIUM', () => {
    const body = 'Priority: critical\n\nFull outage.';
    expect(parseEmailBody(body).priority).toBe('URGENT');

    const body2 = 'Priority: normal\n\nMinor thing.';
    expect(parseEmailBody(body2).priority).toBe('MEDIUM');
  });

  it('returns full body as description when no structured fields present', () => {
    const body = 'Just a plain email with no fields.';
    const result = parseEmailBody(body);
    expect(result.category).toBeUndefined();
    expect(result.priority).toBeUndefined();
    expect(result.description).toBe('Just a plain email with no fields.');
  });

  it('handles body with only fields and no description', () => {
    const body = 'Category: Technical\nPriority: HIGH';
    const result = parseEmailBody(body);
    expect(result.category).toBe('Technical');
    // description falls back to full body when nothing after fields
    expect(result.description).toBeTruthy();
  });

  it('ignores unrecognised field keys', () => {
    const body = 'Category: Technical\nFoo: bar\n\nActual description.';
    const result = parseEmailBody(body);
    expect(result.category).toBe('Technical');
    expect(result.description).toBe('Actual description.');
  });
});

describe('parseEmail (combined)', () => {
  it('strips subject prefix and parses body fields together', () => {
    const subject = '[HELPDESK] App crashes on startup';
    const body = 'Category: Technical\nPriority: URGENT\n\nThe app crashes immediately.';
    const result = parseEmail(subject, body);
    expect(result.subject).toBe('App crashes on startup');
    expect(result.category).toBe('Technical');
    expect(result.priority).toBe('URGENT');
    expect(result.description).toBe('The app crashes immediately.');
  });
});
