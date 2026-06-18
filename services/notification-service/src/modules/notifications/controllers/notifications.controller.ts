import {
  Controller,
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { NotificationsRepository } from '../notifications.repository.js';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly repo: NotificationsRepository) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for the current user (cursor-paginated)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor (notification id)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 50)' })
  @ApiResponse({ status: 200, description: 'Feed items + unread count + next cursor' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listFeed(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const pageSize = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    const [items, unreadCount] = await Promise.all([
      this.repo.listInApp({ recipientId: user.sub, cursor, limit: pageSize + 1 }),
      this.repo.countUnread(user.sub),
    ]);

    const hasMore = items.length > pageSize;
    const page = hasMore ? items.slice(0, pageSize) : items;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;

    return {
      items: page,
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

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark all in-app notifications as read' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.repo.markAllRead(user.sub);
  }
}
