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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
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
}
