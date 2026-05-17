import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsBoolean, IsInt, IsOptional, IsString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';
import { ImapIngestService } from '../mail/imap-ingest.service';
import { MailerService } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

// Keys masked in GET responses (never echo raw credentials)
const MASKED_KEYS = new Set(['imapPass', 'smtpPass']);
const MASK = '***';

const ENV_DEFAULTS: Record<string, string> = {
  autoCloseDays: process.env.AUTO_CLOSE_DAYS ?? '5',
  imapEnabled:   process.env.IMAP_ENABLED    ?? 'false',
  imapHost:      process.env.IMAP_HOST       ?? '',
  imapPort:      process.env.IMAP_PORT       ?? '993',
  imapSecure:    process.env.IMAP_SECURE     ?? 'true',
  imapUser:      process.env.IMAP_USER       ?? '',
  imapPass:      process.env.IMAP_PASS       ?? '',
  smtpHost:      process.env.SMTP_HOST       ?? '',
  smtpPort:      process.env.SMTP_PORT       ?? '1025',
  smtpSecure:    process.env.SMTP_SECURE     ?? 'false',
  smtpUser:      process.env.SMTP_USER       ?? '',
  smtpPass:      process.env.SMTP_PASS       ?? '',
  mailFrom:      process.env.MAIL_FROM       ?? 'Help Desk <support@helpdesk.local>',
};

class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) autoCloseDays?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapEnabled?: boolean;
  @IsOptional() @IsString() imapHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) imapPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapSecure?: boolean;
  @IsOptional() @IsString() imapUser?: string;
  // Pass "***" to leave existing password unchanged
  @IsOptional() @IsString() imapPass?: string;
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) smtpPort?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) smtpSecure?: boolean;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPass?: string;
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

  private async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.setting.findMany();
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...ENV_DEFAULTS, ...db };
  }

  private mask(raw: Record<string, string>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (MASKED_KEYS.has(k)) {
        out[k] = v ? MASK : '';
      } else {
        out[k] = v;
      }
    }
    // Cast primitives
    return {
      autoCloseDays: parseInt(out.autoCloseDays as string, 10),
      imapEnabled:   out.imapEnabled === 'true',
      imapHost:      out.imapHost,
      imapPort:      parseInt(out.imapPort as string, 10),
      imapSecure:    out.imapSecure === 'true',
      imapUser:      out.imapUser,
      imapPass:      out.imapPass,
      smtpHost:      out.smtpHost,
      smtpPort:      parseInt(out.smtpPort as string, 10),
      smtpSecure:    out.smtpSecure === 'true',
      smtpUser:      out.smtpUser,
      smtpPass:      out.smtpPass,
      mailFrom:      out.mailFrom,
    };
  }

  // ---------- settings ----------

  @Roles('ADMIN')
  @Get('settings')
  async settings() {
    return this.mask(await this.getAll());
  }

  @Roles('ADMIN')
  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    const kvMap: Record<string, string> = {};
    if (dto.autoCloseDays !== undefined) kvMap.autoCloseDays = String(dto.autoCloseDays);
    if (dto.imapEnabled  !== undefined) kvMap.imapEnabled   = String(dto.imapEnabled);
    if (dto.imapHost     !== undefined) kvMap.imapHost      = dto.imapHost;
    if (dto.imapPort     !== undefined) kvMap.imapPort      = String(dto.imapPort);
    if (dto.imapSecure   !== undefined) kvMap.imapSecure    = String(dto.imapSecure);
    if (dto.imapUser     !== undefined) kvMap.imapUser      = dto.imapUser;
    if (dto.imapPass     !== undefined && dto.imapPass !== MASK) kvMap.imapPass = dto.imapPass;
    if (dto.smtpHost     !== undefined) kvMap.smtpHost      = dto.smtpHost;
    if (dto.smtpPort     !== undefined) kvMap.smtpPort      = String(dto.smtpPort);
    if (dto.smtpSecure   !== undefined) kvMap.smtpSecure    = String(dto.smtpSecure);
    if (dto.smtpUser     !== undefined) kvMap.smtpUser      = dto.smtpUser;
    if (dto.smtpPass     !== undefined && dto.smtpPass !== MASK) kvMap.smtpPass = dto.smtpPass;
    if (dto.mailFrom     !== undefined) kvMap.mailFrom      = dto.mailFrom;

    await Promise.all(
      Object.entries(kvMap).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );
    return this.mask(await this.getAll());
  }

  // ---------- IMAP poll ----------

  @Roles('ADMIN')
  @Post('mail/poll-now')
  pollNow() {
    return this.imap.poll();
  }

  // ---------- test connections ----------

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
