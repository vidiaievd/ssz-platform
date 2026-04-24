import type { ContainerVersionsQueryDto } from '../../../presentation/dto/requests/container-versions-query.dto.js';

export class GetContainerVersionsQuery {
  constructor(
    public readonly containerId: string,
    public readonly dto: ContainerVersionsQueryDto,
  ) {}
}
