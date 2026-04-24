import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { ContainerListQueryDto } from '../../../presentation/dto/requests/container-list-query.dto.js';

export class GetContainersQuery {
  constructor(
    public readonly dto: ContainerListQueryDto,
    public readonly user: AuthenticatedUser,
  ) {}
}
