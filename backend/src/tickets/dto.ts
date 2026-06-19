import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import { Priority, TicketStatus, MessageType } from '@prisma/client';

export class CreateTicketDto {
  @IsString() @MinLength(3) subject: string;
  @IsString() @MinLength(1) description: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsArray() attachmentIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) assigneeIds?: string[];
}

export class UpdateTicketDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() categoryId?: string;
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
