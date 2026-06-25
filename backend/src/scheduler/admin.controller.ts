import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';
import { ImapIngestService } from '../mail/imap-ingest.service';
import { MailerService, SmtpConfig } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const MASK = '***';

// Maps DTO field names → process.env key names
const ENV_KEY: Record<string, string> = {
  autoCloseDays:    'AUTO_CLOSE_DAYS',
  autoCloseEnabled: 'AUTO_CLOSE_ENABLED',
  imapEnabled:      'IMAP_ENABLED',
  imapHost:      'IMAP_HOST',
  imapPort:      'IMAP_PORT',
  imapSecure:    'IMAP_SECURE',
  imapUser:      'IMAP_USER',
  imapPass:      'IMAP_PASS',
  smtpHost:      'SMTP_HOST',
  smtpPort:      'SMTP_PORT',
  smtpSecure:    'SMTP_SECURE',
  smtpUser:      'SMTP_USER',
  smtpPass:      'SMTP_PASS',
  mailFrom:      'MAIL_FROM',
};

const MASKED_FIELDS = new Set(['imapPass', 'smtpPass']);

// Configurable option lists, stored as JSON in the Setting table (no migration).
// Readable by staff (for dropdowns), editable by admins.
const CONFIG_DEFAULTS: Record<string, string[]> = {
  resolutionOptions: [
    'Fixed',
    'Workaround Provided',
    'Configuration Change',
    'No Fault Found',
    'Duplicate',
    "Won't Fix",
    'User Error',
    'Resolved by Customer',
  ],
  rootCauseOptions: [
    'Human Error',
    'Software Bug',
    'Configuration Issue',
    'Hardware Failure',
    'Network Issue',
    'Third-party Dependency',
    'Process Gap',
    'Unknown',
  ],
  tagOptions: [
    'bug',
    'feature-request',
    'urgent',
    'billing',
    'security',
    'performance',
    'documentation',
  ],
  priorityOptions: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  timeLogTypes: ['INVESTIGATION', 'DEVELOPMENT', 'TESTING', 'MEETING', 'OTHER'],
  escalationContacts: [],
};

class ConfigDto {
  @IsOptional() @IsArray() @IsString({ each: true }) resolutionOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) rootCauseOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tagOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) priorityOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) timeLogTypes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) escalationContacts?: string[];
}

class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) autoCloseDays?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) autoCloseEnabled?: boolean;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapEnabled?: boolean;
  @IsOptional() @IsString() imapHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) imapPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapSecure?: boolean;
  @IsOptional() @IsString() imapUser?: string;
  @IsOptional() @IsString() imapPass?: string;   // send "***" to leave unchanged
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) smtpPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) smtpSecure?: boolean;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPass?: string;   // send "***" to leave unchanged
  @IsOptional() @IsString() mailFrom?: string;
}

class TestSmtpDto {
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) smtpPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) smtpSecure?: boolean;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPass?: string;
  @IsOptional() @IsString() mailFrom?: string;
}

class TestImapDto {
  @IsOptional() @IsString() imapHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) imapPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapSecure?: boolean;
  @IsOptional() @IsString() imapUser?: string;
  @IsOptional() @IsString() imapPass?: string;
}

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly imap: ImapIngestService,
    private readonly mailer: MailerService,
    private readonly prisma: PrismaService,
  ) {}

  private readAll() {
    // Always read live from process.env — updated at runtime by PATCH
    return {
      autoCloseDays:    parseInt(process.env.AUTO_CLOSE_DAYS ?? '5', 10),
      autoCloseEnabled: process.env.AUTO_CLOSE_ENABLED !== 'false',
      imapEnabled:   process.env.IMAP_ENABLED   === 'true',
      imapHost:      process.env.IMAP_HOST      ?? '',
      imapPort:      parseInt(process.env.IMAP_PORT ?? '993', 10),
      imapSecure:    process.env.IMAP_SECURE    !== 'false',
      imapUser:      process.env.IMAP_USER      ?? '',
      imapPass:      process.env.IMAP_PASS      ? MASK : '',
      smtpHost:      process.env.SMTP_HOST      ?? '',
      smtpPort:      parseInt(process.env.SMTP_PORT ?? '1025', 10),
      smtpSecure:    process.env.SMTP_SECURE    === 'true',
      smtpUser:      process.env.SMTP_USER      ?? '',
      smtpPass:      process.env.SMTP_PASS      ? MASK : '',
      mailFrom:      process.env.MAIL_FROM      ?? 'Help Desk <support@helpdesk.local>',
    };
  }

  @Roles('ADMIN')
  @Get('settings')
  settings() {
    return this.readAll();
  }

  @Roles('ADMIN')
  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    // Build map of field → string value, skipping masked password sentinels
    const updates: Record<string, string> = {};
    for (const [field, envKey] of Object.entries(ENV_KEY)) {
      const val = (dto as any)[field];
      if (val === undefined) continue;
      if (MASKED_FIELDS.has(field) && val === MASK) continue;
      updates[envKey] = String(val);
    }

    // 1. Apply to process.env immediately — services re-read on next call
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    // 2. Best-effort DB persistence (silent if Setting table doesn't exist yet)
    try {
      await Promise.all(
        Object.entries(updates).map(([envKey, value]) => {
          // Convert env key back to dto field name for DB key
          const dbKey = Object.entries(ENV_KEY).find(([, v]) => v === envKey)?.[0] ?? envKey;
          return this.prisma.setting.upsert({
            where:  { key: dbKey },
            update: { value },
            create: { key: dbKey, value },
          });
        }),
      );
    } catch {
      // Setting table may not exist yet — process.env update already took effect
    }

    return this.readAll();
  }

  // ── Configurable option lists (resolution, etc.) ──

  @Roles('ADMIN', 'AGENT')
  @Get('config')
  async getConfig() {
    const keys = Object.keys(CONFIG_DEFAULTS);
    let rows: { key: string; value: string }[] = [];
    try {
      rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    } catch {
      // Setting table unavailable — fall back to defaults.
    }
    const out: Record<string, string[]> = {};
    for (const k of keys) {
      out[k] = CONFIG_DEFAULTS[k];
      const row = rows.find((r) => r.key === k);
      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) out[k] = parsed.filter((v) => typeof v === 'string');
        } catch {
          /* keep default */
        }
      }
    }
    return out;
  }

  @Roles('ADMIN')
  @Put('config')
  async setConfig(@Body() dto: ConfigDto) {
    const fields: (keyof ConfigDto)[] = [
      'resolutionOptions', 'rootCauseOptions', 'tagOptions',
      'priorityOptions', 'timeLogTypes', 'escalationContacts',
    ];
    for (const field of fields) {
      const arr = dto[field];
      if (!arr) continue;
      const value = JSON.stringify(arr.map((s) => s.trim()).filter(Boolean));
      await this.prisma.setting.upsert({ where: { key: field }, update: { value }, create: { key: field, value } });
    }
    return this.getConfig();
  }

  @Roles('ADMIN')
  @Post('mail/poll-now')
  pollNow() {
    return this.imap.poll();
  }

  @Roles('ADMIN')
  @Post('settings/test-imap')
  testImap(@Body() dto: TestImapDto) {
    const cfg = dto.imapHost ? {
      host:   dto.imapHost,
      port:   dto.imapPort  ?? 993,
      secure: dto.imapSecure ?? true,
      user:   dto.imapUser  ?? '',
      pass:   dto.imapPass === MASK ? (process.env.IMAP_PASS ?? '') : (dto.imapPass ?? ''),
    } : undefined;
    return this.imap.testConnection(cfg);
  }

  @Roles('ADMIN')
  @Post('settings/test-smtp')
  testSmtp(@CurrentUser() user: AuthUser, @Body() dto: TestSmtpDto) {
    const cfg: SmtpConfig | undefined = dto.smtpHost ? {
      host:   dto.smtpHost,
      port:   dto.smtpPort   ?? 587,
      secure: dto.smtpSecure ?? false,
      user:   dto.smtpUser   ?? undefined,
      pass:   dto.smtpPass === MASK ? (process.env.SMTP_PASS ?? undefined) : (dto.smtpPass ?? undefined),
      from:   dto.mailFrom   ?? process.env.MAIL_FROM ?? 'Help Desk <support@helpdesk.local>',
    } : undefined;
    return this.mailer.testConnection(user.email, cfg);
  }
}
