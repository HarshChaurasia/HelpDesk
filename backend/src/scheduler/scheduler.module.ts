import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { AdminController } from './admin.controller';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [MailModule, PrismaModule],
  controllers: [AdminController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
