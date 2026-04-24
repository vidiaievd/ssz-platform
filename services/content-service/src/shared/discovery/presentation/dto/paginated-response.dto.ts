import { ApiProperty } from '@nestjs/swagger';

/**
 * Generic paginated response wrapper.
 * Canonical location — replaces the copy in container/presentation/dto/responses/.
 * That copy is kept as a re-export for backward compatibility until all modules
 * are migrated (Steps 2–4).
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'Page of results' })
  items!: T[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  constructor(partial: PaginatedResponseDto<T>) {
    Object.assign(this, partial);
  }
}
