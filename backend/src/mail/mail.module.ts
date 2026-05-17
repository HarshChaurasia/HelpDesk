import { Module, forwardRef } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ImapIngestService } from './imap-ingest.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [forwardRef(() => TicketsModule)],
  providers: [MailerService, ImapIngestService],
  exports: [MailerService, ImapIngestService],
})
export class MailModule {}
