import { Module, forwardRef } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ImapIngestService } from './imap-ingest.service';
import { TicketsModule } from '../tickets/tickets.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, forwardRef(() => TicketsModule)],
  providers: [MailerService, ImapIngestService],
  exports: [MailerService, ImapIngestService],
})
export class MailModule {}
