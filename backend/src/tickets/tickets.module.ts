import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AttachmentsController } from './attachments.controller';

@Module({
  controllers: [TicketsController, AttachmentsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
