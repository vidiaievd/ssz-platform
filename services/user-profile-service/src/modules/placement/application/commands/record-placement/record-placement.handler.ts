import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { PlacementResult } from '../../../domain/entities/placement-result.entity.js';
import { PLACEMENT_RESULT_REPOSITORY } from '../../../domain/repositories/placement-result.repository.interface.js';
import type { IPlacementResultRepository } from '../../../domain/repositories/placement-result.repository.interface.js';
import { RecordPlacementCommand } from './record-placement.command.js';

@CommandHandler(RecordPlacementCommand)
export class RecordPlacementHandler implements ICommandHandler<RecordPlacementCommand> {
  constructor(
    @Inject(PLACEMENT_RESULT_REPOSITORY)
    private readonly repo: IPlacementResultRepository,
  ) {}

  async execute(command: RecordPlacementCommand): Promise<void> {
    const result = PlacementResult.create({
      id: randomUUID(),
      userId: command.userId,
      language: command.language,
      cefrLevel: command.cefrLevel,
      score: command.score,
      scope: command.scope,
      membershipId: command.membershipId,
      sourceLabel: command.sourceLabel,
      takenAt: command.takenAt,
    });
    await this.repo.save(result);
  }
}
