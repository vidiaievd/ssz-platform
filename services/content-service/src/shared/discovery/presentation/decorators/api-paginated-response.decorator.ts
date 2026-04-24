import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Swagger decorator for paginated catalog endpoints.
 * Produces a proper OpenAPI schema with typed `items[]` instead of the generic
 * `{ isArray: true }` placeholder that ApiOkResponse({ type: PaginatedResponseDto }) gives.
 *
 * Usage:
 *   @ApiPaginatedResponse(ContainerListItemDto)
 *   async findAll(...) { ... }
 */
export function ApiPaginatedResponse<T extends Type<unknown>>(model: T) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
        required: ['items', 'total', 'page', 'limit', 'totalPages'],
      },
    }),
  );
}
