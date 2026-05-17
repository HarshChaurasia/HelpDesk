import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Priority, TicketStatus, MessageType } from '@prisma/client';

export class CreateTicketDto {
  @IsString() @MinLength(3) subject: string;
  @IsString() @MinLength(3) description: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsArray() attachmentIds?: string[];
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
  @IsUUID() assignedToId: string;
}

export class MessageDto {
  @IsString() @MinLength(1) body: string;
  @IsOptional() @IsEnum(MessageType) type?: MessageType;
}

export class WatcherDto {
  @IsUUID() userId: string;
}
