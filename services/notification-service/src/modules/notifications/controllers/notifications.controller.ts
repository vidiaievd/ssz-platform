import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { InAppNotificationDto } from '@ssz/contracts';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { NotificationsRepository, type InAppFeedFilter } from '../notifications.repository.js';
import type { NotificationType } from '../../../../generated/prisma/enums.js';
import { BulkNotificationActionDto } from './bulk-notification-action.dto.js';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly repo: NotificationsRepository) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for the current user (cursor-paginated)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor (notification id)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 50)' })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'unread', 'archived'], description: 'Default: all (non-archived)' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by NotificationType' })
  @ApiResponse({ status: 200, description: 'Feed items + unread count + next cursor' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listFeed(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: InAppFeedFilter,
    @Query('type') type?: NotificationType,
  ) {
    const pageSize = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    const [items, unreadCount] = await Promise.all([
      this.repo.listInApp({ recipientId: user.sub, cursor, limit: pageSize + 1, filter, type }),
      this.repo.countUnread(user.sub),
    ]);

    const hasMore = items.length > pageSize;
    const page = hasMore ? items.slice(0, pageSize) : items;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;

    const dtoItems: InAppNotificationDto[] = page.map((n) => ({
      id: n.id,
      type: n.type,
      templateData: n.templateData as Record<string, unknown>,
      isRead: n.isRead,
      archivedAt: n.archivedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      items: dtoItems,
      unreadCount,
      nextCursor,
    };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read (idempotent)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.repo.markRead(id, user.sub);
  }

  @Post(':id/unread')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as unread (idempotent)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markUnread(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.repo.markUnread(id, user.sub);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark all in-app notifications as read' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.repo.markAllRead(user.sub);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a notification (idempotent)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async archive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.repo.archive(id, user.sub);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unarchive a notification (idempotent)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unarchive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.repo.unarchive(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete a notification' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.repo.delete(id, user.sub);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Apply a read/unread/archive/unarchive/delete action to a set of notifications' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bulk(
    @CurrentUser() user: JwtPayload,
    @Body() body: BulkNotificationActionDto,
  ): Promise<void> {
    await this.repo.bulk(body.ids, user.sub, body.action);
  }
}
