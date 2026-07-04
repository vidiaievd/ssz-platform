import type { RelatableEntityType } from '../../../../shared/application/ports/content-client.port.js';

export class GetContentMasteryQuery {
  constructor(
    public readonly userId: string,
    public readonly sourceType: RelatableEntityType,
    public readonly sourceId: string,
  ) {}
}
