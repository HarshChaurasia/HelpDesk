import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Priority, TicketStatus, MessageType, TimeLogType } from '@prisma/client';

export class CreateTicketDto {
  @IsString() @MinLength(3) subject: string;
  @IsString() @MinLength(1) description: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() subcategoryId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsArray() attachmentIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) assigneeIds?: string[];
  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsString() systemProduct?: string;
  @IsOptional() @IsString() systemModule?: string;
  @IsOptional() @IsString() systemVersion?: string;
  @IsOptional() @IsString() systemBrowser?: string;
  @IsOptional() @IsString() systemOs?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() subcategoryId?: string;
  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsString() resolutionSummary?: string;
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() correctiveAction?: string;
  @IsOptional() @IsString() preventiveAction?: string;
  @IsOptional() @IsString() systemProduct?: string;
  @IsOptional() @IsString() systemModule?: string;
  @IsOptional() @IsString() systemVersion?: string;
  @IsOptional() @IsString() systemBrowser?: string;
  @IsOptional() @IsString() systemOs?: string;
  @IsOptional() @IsBoolean() noAutoClose?: boolean;
}

export class StatusDto {
  @IsEnum(TicketStatus) status: TicketStatus;
}

export class AssignDto {
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) userIds?: string[];
}

export class MessageDto {
  @IsString() @MinLength(1) body: string;
  @IsOptional() @IsEnum(MessageType) type?: MessageType;
}

export class EditMessageDto {
  @IsString() @MinLength(1) body: string;
}

export class ReactionDto {
  @IsString() @MinLength(1) emoji: string;
}

export class WatcherDto {
  @IsUUID() userId: string;
}

export class TimeLogDto {
  @IsEnum(TimeLogType) type: TimeLogType;
  @IsNumber() @Min(0.1) hours: number;
  @IsOptional() @IsBoolean() billable?: boolean;
  @IsOptional() @IsString() note?: string;
}

export class TagToggleDto {
  @IsUUID() tagId: string;
}

export class BulkActionDto {
  @IsArray() @IsUUID('4', { each: true }) ids: string[];
  @IsString() action: string;
  @IsOptional() payload?: any;
}
