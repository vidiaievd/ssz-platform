import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';

export class CreateListeningStageCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly exerciseId: string,
    public readonly position: number,
    public readonly stageType: ListeningStageType,
  ) {}
}
