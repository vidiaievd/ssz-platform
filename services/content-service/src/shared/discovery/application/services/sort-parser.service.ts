import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import type { SortParam, SortDirection } from '../../domain/types/sort.js';

const MAX_SORT_PARAMS = 3;

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

@Injectable()
export class SortParserService {
  private readonly logger = new Logger(SortParserService.name);

  /**
   * Parses a raw sort query string into typed SortParams.
   *
   * Accepted format: `field_direction` or comma-separated `field1_asc,field2_desc`.
   * Field names are snake_case (e.g. `created_at`), converted to camelCase for Prisma.
   * Direction suffix must be `asc` or `desc`.
   *
   * @param raw       Raw query string value, e.g. "created_at_desc,title_asc"
   * @param allowedFields  Snake_case field names that may be sorted on
   * @param fallback  Returned as-is when raw is undefined
   */
  parse(raw: string | undefined, allowedFields: string[], fallback: SortParam[]): SortParam[] {
    if (!raw) return fallback;

    const tokens = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length > MAX_SORT_PARAMS) {
      this.logger.debug(
        `sort string contains ${tokens.length} params; truncating to ${MAX_SORT_PARAMS}`,
      );
    }

    const results: SortParam[] = [];

    for (const token of tokens.slice(0, MAX_SORT_PARAMS)) {
      const parts = token.split('_');
      if (parts.length < 2) {
        throw new BadRequestException(
          `Invalid sort token "${token}". Expected format: field_asc or field_desc.`,
        );
      }

      const directionRaw = parts.at(-1)!;
      if (directionRaw !== 'asc' && directionRaw !== 'desc') {
        throw new BadRequestException(
          `Invalid sort direction "${directionRaw}" in "${token}". Use "asc" or "desc".`,
        );
      }

      const snakeField = parts.slice(0, -1).join('_');

      if (!allowedFields.includes(snakeField)) {
        throw new BadRequestException(
          `Sort field "${snakeField}" is not allowed. Allowed fields: ${allowedFields.join(', ')}.`,
        );
      }

      results.push({
        field: snakeToCamel(snakeField),
        direction: directionRaw as SortDirection,
      });
    }

    return results.length > 0 ? results : fallback;
  }

  /**
   * Converts SortParam[] to a Prisma orderBy array.
   * Each element becomes { [field]: direction } which Prisma accepts directly.
   */
  toPrismaOrderBy<T>(params: SortParam[]): T[] {
    return params.map((p) => ({ [p.field]: p.direction }) as T);
  }
}
