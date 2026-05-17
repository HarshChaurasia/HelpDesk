import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { ImapIngestService } from '../mail/imap-ingest.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(private readonly imap: ImapIngestService) {}

  @Roles('ADMIN')
  @Post('mail/poll-now')
  pollNow() {
    return this.imap.poll();
  }

  @Roles('ADMIN')
  @Get('settings')
  settings() {
    return {
      autoCloseDays: parseInt(process.env.AUTO_CLOSE_DAYS ?? '5', 10),
      imapEnabled: process.env.IMAP_ENABLED === 'true',
      smtpHost: process.env.SMTP_HOST ?? null,
      imapHost: process.env.IMAP_HOST ?? null,
    };
  }

  @Roles('ADMIN')
  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    // Runtime-mutable settings would be persisted to a Settings table in v2.
    // For v1 these are env-driven; echo back what was requested.
    return { ok: true, note: 'Settings are env-driven in v1', requested: body };
  }
}
