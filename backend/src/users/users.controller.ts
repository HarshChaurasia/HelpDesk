import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Role, NotifChannelPref } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) fullName: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class NotifPrefDto {
  @IsEnum(NotifChannelPref) notifPref: NotifChannelPref;
}

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  private safe(u: any) {
    if (!u) return u;
    const { passwordHash, ...rest } = u;
    return rest;
  }

  @Roles('ADMIN')
  @Get()
  async list(
    @Query('role') role?: Role,
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        role,
        isActive: isActive === undefined ? undefined : isActive === 'true',
        OR: q
          ? [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.safe(u));
  }

  @Roles('ADMIN', 'AGENT')
  @Get('agents')
  async agents() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['AGENT', 'ADMIN'] }, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
    });
    return users;
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() dto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: dto.password
          ? await argon2.hash(dto.password)
          : null,
      },
    });
    return this.safe(user);
  }

  @Roles('ADMIN')
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.safe(await this.prisma.user.findUnique({ where: { id } }));
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.safe(
      await this.prisma.user.update({ where: { id }, data: dto }),
    );
  }

  @Roles('ADMIN')
  @Delete(':id')
  async deactivate(@Param('id') id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  @Patch('me/notification-pref')
  async setPref(@CurrentUser() me: AuthUser, @Body() dto: NotifPrefDto) {
    return this.safe(
      await this.prisma.user.update({
        where: { id: me.id },
        data: { notifPref: dto.notifPref },
      }),
    );
  }
}
