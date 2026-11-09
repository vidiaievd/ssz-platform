import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../shared/application/ports/profile-service.interface.js';
import {
  ADMIN_SCHOOLS_READER,
  type AdminSchoolDetail,
  type IAdminSchoolsReader,
} from '../../domain/admin-school.js';
import { GetAdminSchoolQuery } from './get-admin-school.query.js';

/** The school's card for the admin panel, or null when no row has that id (deleted ones included). */
@QueryHandler(GetAdminSchoolQuery)
export class GetAdminSchoolHandler implements IQueryHandler<GetAdminSchoolQuery, AdminSchoolDetail | null> {
  private readonly logger = new Logger(GetAdminSchoolHandler.name);

  constructor(
    @Inject(ADMIN_SCHOOLS_READER) private readonly reader: IAdminSchoolsReader,
    @Inject(PROFILE_SERVICE_PORT) private readonly profiles: IProfileServicePort,
  ) {}

  async execute({ schoolId }: GetAdminSchoolQuery): Promise<AdminSchoolDetail | null> {
    const row = await this.reader.findById(schoolId);
    if (!row) return null;

    const { ownerId, ...school } = row;
    return { ...school, owner: { userId: ownerId, ...(await this.ownerSummary(ownerId)) } };
  }

  /** The owner is not a roster row, so the name comes from profile-service; a failure leaves it blank. */
  private async ownerSummary(ownerId: string): Promise<{ name: string | null; email: string | null }> {
    try {
      const summary = await this.profiles.getProfileSummary(ownerId);
      return { name: summary?.name ?? null, email: summary?.email ?? null };
    } catch (err) {
      this.logger.warn(`Owner ${ownerId} unresolved: ${err instanceof Error ? err.message : String(err)}`);
      return { name: null, email: null };
    }
  }
}
