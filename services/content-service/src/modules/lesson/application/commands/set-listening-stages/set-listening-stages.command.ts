import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';

export interface ListeningStageInput {
  exerciseId: string;
  position: number;
  stageType: ListeningStageType;
}

export class SetListeningStagesCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly stages: ListeningStageInput[],
  ) {}
}
