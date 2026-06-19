import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators';
import { TicketsService } from './tickets.service';

@ApiTags('attachments')
@ApiBearerAuth('access-token')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get(':id')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const attachment = await this.tickets.getAttachment(id, user);
    const uploadDir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
    const filePath = join(uploadDir, attachment.storageKey);

    if (!existsSync(filePath)) throw new NotFoundException('File not found on disk');

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    res.setHeader('Content-Length', attachment.sizeBytes);
    createReadStream(filePath).pipe(res);
  }

  @Get(':id/preview')
  async preview(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const attachment = await this.tickets.getAttachment(id, user);
    const uploadDir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
    const filePath = join(uploadDir, attachment.storageKey);

    if (!existsSync(filePath)) throw new NotFoundException('File not found on disk');

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.setHeader('Content-Length', attachment.sizeBytes);
    createReadStream(filePath).pipe(res);
  }

  @Delete(':id')
  deleteAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.deleteAttachment(id, user);
  }
}
