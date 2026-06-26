import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';
import type { BulkNotificationAction } from '../notifications.repository.js';

const BULK_ACTIONS: BulkNotificationAction[] = ['read', 'unread', 'archive', 'unarchive', 'delete'];

export class BulkNotificationActionDto {
  @ApiProperty({ type: [String], description: 'Notification ids to act on' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: BULK_ACTIONS })
  @IsIn(BULK_ACTIONS)
  action!: BulkNotificationAction;
}
