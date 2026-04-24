import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaginationService } from './application/services/pagination.service.js';
import { SortParserService } from './application/services/sort-parser.service.js';
import { CatalogQueryBuilderService } from './application/services/catalog-query-builder.service.js';

/**
 * Shared discovery module — pagination, sorting, and catalog query building.
 * Marked @Global so feature modules can inject the services without importing
 * DiscoveryModule themselves (mirrors AccessControlModule pattern).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [PaginationService, SortParserService, CatalogQueryBuilderService],
  exports: [PaginationService, SortParserService, CatalogQueryBuilderService],
})
export class DiscoveryModule {}
