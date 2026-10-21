import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

export class MoveContainerItemCommand {
  constructor(
    public readonly user: AuthenticatedUser,
    /** The container the route names — the one the access guard checked. */
    public readonly containerId: string,
    public readonly versionId: string,
    /** `container_items.id` of the row to move. */
    public readonly rowId: string,
    /** The container whose draft receives the row. */
    public readonly targetContainerId: string,
    /** A section of the target draft; null or absent places the row outside any section. */
    public readonly targetSectionId: string | null,
  ) {}
}
