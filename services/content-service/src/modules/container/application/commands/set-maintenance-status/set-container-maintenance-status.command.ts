import type { MaintenanceStatus } from '../../../domain/value-objects/maintenance-status.vo.js';

/** The author marks a course as maintained, no longer maintained, or obsolete (plan 90, Q5). */
export class SetContainerMaintenanceStatusCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly status: MaintenanceStatus,
  ) {}
}
