import { Module } from '@nestjs/common';
import { ViewsController } from './views.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ViewsController],
})
export class ViewsModule {}
