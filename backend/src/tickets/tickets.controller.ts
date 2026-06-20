import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { TicketsService } from './tickets.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  StatusDto,
  AssignDto,
  MessageDto,
  EditMessageDto,
  ReactionDto,
  WatcherDto,
  TimeLogDto,
  TagToggleDto,
  BulkActionDto,
  CcDto,
  FeedbackDto,
  MergeDto,
} from './dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../common/decorators';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip',
]);

const uploadStorage = diskStorage({
  destination: join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'),
  filename: (_req, file, cb) =>
    cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

const uploadInterceptor = FileInterceptor('file', {
  storage: uploadStorage,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_BYTES ?? '10485760', 10) },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
  },
});

@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.tickets.list(user, q);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.tickets.create(dto, user);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() q: any, @Res() res: Response) {
    const csv = await this.tickets.exportCsv(user, q);
    const filename = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + csv);
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
    const ids = dto.userIds ?? (dto.assignedToId ? [dto.assignedToId] : []);
    return this.tickets.assign(id, ids, user);
  }

  @Post(':id/messages')
  message(
    @Param('id') id: string,
    @Body() dto: MessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.addMessage(id, dto, user);
  }

  @Patch(':id/messages/:msgId')
  editMessage(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.editMessage(id, msgId, dto.body, user);
  }

  @Delete(':id/messages/:msgId')
  deleteMessage(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.deleteMessage(id, msgId, user);
  }

  @Post(':id/messages/:msgId/reactions')
  toggleReaction(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() dto: ReactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.toggleReaction(id, msgId, dto.emoji, user);
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

  @Roles('AGENT', 'ADMIN')
  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() dto: MergeDto, @CurrentUser() user: AuthUser) {
    return this.tickets.mergeTickets(id, dto.targetId, user);
  }

  @Post(':id/feedback')
  submitFeedback(@Param('id') id: string, @Body() dto: FeedbackDto, @CurrentUser() user: AuthUser) {
    return this.tickets.submitFeedback(id, dto.rating, dto.comment, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Post(':id/cc')
  addCC(@Param('id') id: string, @Body() dto: CcDto, @CurrentUser() user: AuthUser) {
    return this.tickets.addCC(id, dto.email, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Delete(':id/cc/:email')
  removeCC(
    @Param('id') id: string,
    @Param('email') email: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.removeCC(id, decodeURIComponent(email), user);
  }

  @Post(':id/attachments')
  @UseInterceptors(uploadInterceptor)
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.tickets.uploadAttachment(id, file, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Post(':id/tags')
  toggleTag(
    @Param('id') id: string,
    @Body() dto: TagToggleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.toggleTag(id, dto.tagId, user);
  }

  @Post(':id/timelogs')
  addTimeLog(
    @Param('id') id: string,
    @Body() dto: TimeLogDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.addTimeLog(id, dto, user);
  }

  @Roles('AGENT', 'ADMIN')
  @Post('bulk')
  bulkAction(
    @Body() dto: BulkActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.bulkAction(dto, user);
  }
}
