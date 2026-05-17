import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

class CategoryDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() slaPolicyId?: string;
}
class SlaDto {
  @IsString() @MinLength(2) name: string;
  @IsObject() responseMins: Record<string, number>;
  @IsObject() resolutionMins: Record<string, number>;
}

@ApiTags('categories')
@ApiBearerAuth('access-token')
@Controller()
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  listCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      include: { slaPolicy: true },
      orderBy: { name: 'asc' },
    });
  }

  @Roles('ADMIN')
  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: Partial<CategoryDto>) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  @Roles('ADMIN')
  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string) {
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  @Roles('ADMIN', 'AGENT')
  @Get('sla-policies')
  listSla() {
    return this.prisma.slaPolicy.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles('ADMIN')
  @Post('sla-policies')
  createSla(@Body() dto: SlaDto) {
    return this.prisma.slaPolicy.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch('sla-policies/:id')
  updateSla(@Param('id') id: string, @Body() dto: Partial<SlaDto>) {
    return this.prisma.slaPolicy.update({ where: { id }, data: dto });
  }
}
