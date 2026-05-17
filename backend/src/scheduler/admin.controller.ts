import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles } from '../common/decorators';
import { ImapIngestService } from '../mail/imap-ingest.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULTS: Record<string, string> = {
  autoCloseDays: process.env.AUTO_CLOSE_DAYS ?? '5',
  imapEnabled: process.env.IMAP_ENABLED ?? 'false',
  smtpHost: process.env.SMTP_HOST ?? '',
  imapHost: process.env.IMAP_HOST ?? '',
};

class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) autoCloseDays?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) imapEnabled?: boolean;
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsString() imapHost?: string;
}

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly imap: ImapIngestService,
    private readonly prisma: PrismaService,
  ) {}

  private async getSetting(key: string): Promise<string> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row?.value ?? DEFAULTS[key] ?? '';
  }

  @Roles('ADMIN')
  @Post('mail/poll-now')
  pollNow() {
    return this.imap.poll();
  }

  @Roles('ADMIN')
  @Get('settings')
  async settings() {
    const [autoCloseDays, imapEnabled, smtpHost, imapHost] = await Promise.all([
      this.getSetting('autoCloseDays'),
      this.getSetting('imapEnabled'),
      this.getSetting('smtpHost'),
      this.getSetting('imapHost'),
    ]);
    return {
      autoCloseDays: parseInt(autoCloseDays, 10),
      imapEnabled: imapEnabled === 'true',
      smtpHost: smtpHost || null,
      imapHost: imapHost || null,
    };
  }

  @Roles('ADMIN')
  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    const updates: Array<{ key: string; value: string }> = [];
    if (dto.autoCloseDays !== undefined)
      updates.push({ key: 'autoCloseDays', value: String(dto.autoCloseDays) });
    if (dto.imapEnabled !== undefined)
      updates.push({ key: 'imapEnabled', value: String(dto.imapEnabled) });
    if (dto.smtpHost !== undefined)
      updates.push({ key: 'smtpHost', value: dto.smtpHost });
    if (dto.imapHost !== undefined)
      updates.push({ key: 'imapHost', value: dto.imapHost });

    await Promise.all(
      updates.map(({ key, value }) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );

    return this.settings();
  }
}
