import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  ADMIN_SCHOOLS_READER,
  type AdminSchoolPage,
  type IAdminSchoolsReader,
} from '../../domain/admin-school.js';
import { ListAdminSchoolsQuery } from './list-admin-schools.query.js';

@QueryHandler(ListAdminSchoolsQuery)
export class ListAdminSchoolsHandler implements IQueryHandler<ListAdminSchoolsQuery, AdminSchoolPage> {
  constructor(@Inject(ADMIN_SCHOOLS_READER) private readonly reader: IAdminSchoolsReader) {}

  execute({ filter, sort, page, limit }: ListAdminSchoolsQuery): Promise<AdminSchoolPage> {
    const search = filter.search?.trim();
    return this.reader.list({ ...filter, search: search ? search : undefined }, sort, page, limit);
  }
}
