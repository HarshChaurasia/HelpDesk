import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength, IsObject } from 'class-validator';
import { CurrentUser, AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class SaveViewDto {
  @IsString() @MinLength(1) name: string;
  @IsObject() filters: Record<string, any>;
}

@ApiTags('views')
@ApiBearerAuth('access-token')
@Controller('views')
export class ViewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.savedView.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  async save(@Body() dto: SaveViewDto, @CurrentUser() user: AuthUser) {
    return this.prisma.savedView.upsert({
      where: { userId_name: { userId: user.id, name: dto.name } },
      update: { filters: dto.filters },
      create: { userId: user.id, name: dto.name, filters: dto.filters },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.prisma.savedView.deleteMany({ where: { id, userId: user.id } });
    return { deleted: true };
  }
}
