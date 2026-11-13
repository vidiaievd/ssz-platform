import type { AdminSchoolFilter, AdminSchoolSort } from '../../domain/admin-school.js';

export class ListAdminSchoolsQuery {
  constructor(
    public readonly filter: AdminSchoolFilter,
    public readonly sort: AdminSchoolSort,
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
