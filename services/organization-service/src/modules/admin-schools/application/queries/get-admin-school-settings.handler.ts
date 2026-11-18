import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  ADMIN_SCHOOL_ROSTER_READER,
  type AdminSchoolSettings,
  type IAdminSchoolRosterReader,
} from '../../domain/admin-school-roster.js';
import { GetAdminSchoolSettingsQuery } from './get-admin-school-settings.query.js';

/**
 * The school's review and AI settings as saved, in one answer — or null for an unknown id.
 * Unlike the school's own `assistant-access`, no school role is asked: the admin level is.
 */
@QueryHandler(GetAdminSchoolSettingsQuery)
export class GetAdminSchoolSettingsHandler implements IQueryHandler<GetAdminSchoolSettingsQuery, AdminSchoolSettings | null> {
  constructor(@Inject(ADMIN_SCHOOL_ROSTER_READER) private readonly reader: IAdminSchoolRosterReader) {}

  execute({ schoolId }: GetAdminSchoolSettingsQuery): Promise<AdminSchoolSettings | null> {
    return this.reader.settings(schoolId);
  }
}
