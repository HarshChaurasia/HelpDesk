/**
 * Parses structured fields from a plain-text email body.
 *
 * Supported inbound format (all fields optional):
 *
 *   Category: Technical
 *   Priority: HIGH
 *   Delivery: 2026-05-20
 *
 *   ---
 *   Free-form description goes here.
 *   May span multiple lines.
 *
 * Rules:
 *  - Field lines must appear before the first blank line or "---" separator.
 *  - Unrecognised field lines are silently ignored.
 *  - Everything after the separator (or after the field block) is the description.
 *  - If no fields are found, the full body is used as the description.
 *  - Subject line prefix "[HELPDESK]" is stripped when present.
 */

export type ParsedPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ParsedEmail {
  subject: string;
  category?: string;
  priority?: ParsedPriority;
  deliveryDate?: string;
  description: string;
}

const FIELD_RE = /^([A-Za-z][A-Za-z\s]{0,30}):\s*(.+)$/;
const SEPARATOR_RE = /^-{3,}$/;
const SUBJECT_PREFIX_RE = /^\[HELPDESK\]\s*/i;

const PRIORITY_MAP: Record<string, ParsedPriority> = {
  low: 'LOW',
  medium: 'MEDIUM',
  normal: 'MEDIUM',
  high: 'HIGH',
  urgent: 'URGENT',
  critical: 'URGENT',
};

export function parseEmailSubject(raw: string): string {
  return raw.replace(SUBJECT_PREFIX_RE, '').trim();
}

export function parseEmailBody(body: string): Omit<ParsedEmail, 'subject'> {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  let descStart = 0;
  let inFields = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFields && SEPARATOR_RE.test(line.trim())) {
      descStart = i + 1;
      inFields = false;
      break;
    }

    if (inFields && line.trim() === '' && i > 0) {
      // blank line ends the field block
      descStart = i + 1;
      inFields = false;
      break;
    }

    if (inFields) {
      const m = FIELD_RE.exec(line);
      if (m) {
        fields[m[1].trim().toLowerCase()] = m[2].trim();
        descStart = i + 1;
      } else if (i === 0) {
        // first line is not a field — no structured header at all
        inFields = false;
        descStart = 0;
        break;
      }
    }
  }

  const description = lines.slice(descStart).join('\n').trim();

  const rawPriority = fields['priority']?.toLowerCase();
  const priority: ParsedPriority | undefined = rawPriority
    ? PRIORITY_MAP[rawPriority]
    : undefined;

  return {
    category: fields['category'] || undefined,
    priority,
    deliveryDate: fields['delivery'] || fields['delivery date'] || undefined,
    description: description || body.trim(),
  };
}

export function parseEmail(subject: string, body: string): ParsedEmail {
  return {
    subject: parseEmailSubject(subject),
    ...parseEmailBody(body),
  };
}
