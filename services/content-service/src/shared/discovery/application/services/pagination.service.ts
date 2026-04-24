import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaginationParams, PaginatedResult } from '../../domain/types/pagination.js';
import type { AppConfig } from '../../../../config/configuration.js';

@Injectable()
export class PaginationService {
  private readonly logger = new Logger(PaginationService.name);

  private readonly defaultPage = 1;
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(@Optional() configService?: ConfigService<AppConfig>) {
    const cfg = configService?.get<AppConfig['discovery']>('discovery');
    this.defaultLimit = cfg?.pagination.defaultLimit ?? 20;
    this.maxLimit = cfg?.pagination.maxLimit ?? 100;
  }

  normalize(page?: number, limit?: number): PaginationParams {
    const p = page ?? this.defaultPage;
    const l = limit ?? this.defaultLimit;

    if (!Number.isInteger(p) || p < 1) {
      throw new BadRequestException('page must be a positive integer >= 1');
    }
    if (!Number.isInteger(l) || l < 1) {
      throw new BadRequestException('limit must be a positive integer >= 1');
    }
    if (l > this.maxLimit) {
      throw new BadRequestException(`limit must be <= ${this.maxLimit}`);
    }

    return { page: p, limit: l };
  }

  toSkipTake(params: PaginationParams): { skip: number; take: number } {
    return {
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    };
  }

  toPaginatedResult<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / params.limit),
    };
  }
}
