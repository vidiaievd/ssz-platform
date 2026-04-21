import { ContainerFilter } from '../../../../../shared/kernel/pagination.js';

export class GetContainersQuery {
  constructor(public readonly filter: ContainerFilter) {}
}
