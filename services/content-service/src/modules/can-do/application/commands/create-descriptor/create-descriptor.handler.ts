import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException } from '@nestjs/common';
import { CreateCanDoDescriptorCommand } from './create-descriptor.command.js';
import { CanDoDescriptorEntity } from '../../../domain/entities/can-do-descriptor.entity.js';
import { CanDoScope } from '../../../domain/value-objects/can-do-scope.vo.js';
import type { CanDoDomainError } from '../../../domain/exceptions/can-do-domain.exceptions.js';
import {
  CAN_DO_DESCRIPTOR_REPOSITORY,
  type ICanDoDescriptorRepository,
} from '../../../domain/repositories/can-do-descriptor.repository.interface.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(CreateCanDoDescriptorCommand)
export class CreateCanDoDescriptorHandler
  implements ICommandHandler<CreateCanDoDescriptorCommand, Result<CanDoDescriptorEntity, CanDoDomainError>>
{
  constructor(
    @Inject(CAN_DO_DESCRIPTOR_REPOSITORY)
    private readonly repo: ICanDoDescriptorRepository,
  ) {}

  async execute(
    command: CreateCanDoDescriptorCommand,
  ): Promise<Result<CanDoDescriptorEntity, CanDoDomainError>> {
    if (command.scope === CanDoScope.GLOBAL && !command.isPlatformAdmin) {
      throw new ForbiddenException('Only platform admins can create global can-do descriptors');
    }
    if (command.scope === CanDoScope.SCHOOL && !command.ownerSchoolId) {
      throw new ForbiddenException('ownerSchoolId is required for school-scoped descriptors');
    }

    const result = CanDoDescriptorEntity.create({
      cefrLevel: command.cefrLevel,
      skill: command.skill,
      scope: command.scope,
      ownerSchoolId: command.ownerSchoolId,
      source: command.source,
      localizations: command.localizations,
      createdByUserId: command.userId,
    });

    if (result.isFail) return result;

    await this.repo.save(result.value);
    return Result.ok(result.value);
  }
}
