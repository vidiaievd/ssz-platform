import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  ADMIN_USER_SCHOOLS_READER,
  assembleUserSchools,
  type AdminUserSchools,
  type IAdminUserSchoolsReader,
} from '../../domain/admin-user-schools.js';
import { GetAdminUserSchoolsQuery } from './get-admin-user-schools.query.js';

/** The schools a user owns and the rosters the user is on; an unknown user has none of either. */
@QueryHandler(GetAdminUserSchoolsQuery)
export class GetAdminUserSchoolsHandler implements IQueryHandler<GetAdminUserSchoolsQuery, AdminUserSchools> {
  constructor(@Inject(ADMIN_USER_SCHOOLS_READER) private readonly reader: IAdminUserSchoolsReader) {}

  async execute({ userId }: GetAdminUserSchoolsQuery): Promise<AdminUserSchools> {
    return assembleUserSchools(userId, await this.reader.rowsOf(userId));
  }
}
