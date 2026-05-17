import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';
import { ImapIngestService } from '../mail/imap-ingest.service';
import { MailerService } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const MASK = '***';

// Maps DTO field names → process.env key names
const ENV_KEY: Record<string, string> = {
  autoCloseDays: 'AUTO_CLOSE_DAYS',
  imapEnabled:   'IMAP_ENABLED',
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

class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) autoCloseDays?: number;
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
      autoCloseDays: parseInt(process.env.AUTO_CLOSE_DAYS ?? '5', 10),
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

  @Roles('ADMIN')
  @Post('mail/poll-now')
  pollNow() {
    return this.imap.poll();
  }

  @Roles('ADMIN')
  @Post('settings/test-imap')
  testImap() {
    return this.imap.testConnection();
  }

  @Roles('ADMIN')
  @Post('settings/test-smtp')
  testSmtp(@CurrentUser() user: AuthUser) {
    return this.mailer.testConnection(user.email);
  }
}
