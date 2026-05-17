import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { AdminController } from './admin.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [AdminController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
