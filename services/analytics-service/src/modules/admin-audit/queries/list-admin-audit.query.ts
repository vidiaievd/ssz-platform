import type { AdminAuditCursor, AdminAuditFilter } from '../domain/admin-audit.js';

export class ListAdminAuditQuery {
  constructor(
    public readonly filter: AdminAuditFilter,
    public readonly cursor: AdminAuditCursor | null,
    public readonly limit: number,
  ) {}
}
