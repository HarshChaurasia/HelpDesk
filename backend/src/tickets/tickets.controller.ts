import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  StatusDto,
  AssignDto,
  MessageDto,
  WatcherDto,
} from './dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';

@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.tickets.list(user, q);
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.tickets.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tickets.getOne(id, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.update(id, dto, user);
  }

  @Post(':id/status')
  status(
    @Param('id') id: string,
    @Body() dto: StatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.changeStatus(id, dto.status, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.assign(id, dto.assignedToId, user);
  }

  @Post(':id/messages')
  message(
    @Param('id') id: string,
    @Body() dto: MessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.addMessage(id, dto, user);
  }

  @Get(':id/events')
  events(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tickets.events(id, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Post(':id/watchers')
  addWatcher(
    @Param('id') id: string,
    @Body() dto: WatcherDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.addWatcher(id, dto.userId, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Delete(':id/watchers/:userId')
  removeWatcher(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.removeWatcher(id, userId, user);
  }
}
