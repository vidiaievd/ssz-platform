import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  ADMIN_SCHOOL_ROSTER_READER,
  type AdminMemberPage,
  type IAdminSchoolRosterReader,
} from '../../domain/admin-school-roster.js';
import { ListAdminSchoolMembersQuery } from './list-admin-school-members.query.js';

/** A school's roster for the admin panel, or null when no school has that id. */
@QueryHandler(ListAdminSchoolMembersQuery)
export class ListAdminSchoolMembersHandler implements IQueryHandler<ListAdminSchoolMembersQuery, AdminMemberPage | null> {
  constructor(@Inject(ADMIN_SCHOOL_ROSTER_READER) private readonly reader: IAdminSchoolRosterReader) {}

  execute({ schoolId, filter, page, limit }: ListAdminSchoolMembersQuery): Promise<AdminMemberPage | null> {
    return this.reader.members(schoolId, filter, page, limit);
  }
}
