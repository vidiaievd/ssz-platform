import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { Profile } from '../../../domain/entities/profile.entity.js';
import { ProfileAlreadyExistsException } from '../../../domain/exceptions/profile-already-exists.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import { CreateProfileCommand } from './create-profile.command.js';

@CommandHandler(CreateProfileCommand)
export class CreateProfileHandler implements ICommandHandler<CreateProfileCommand> {
  private readonly logger = new Logger(CreateProfileHandler.name);

  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
  ) {}

  async execute(command: CreateProfileCommand): Promise<string> {
    const existing = await this.profileRepository.findByUserId(command.userId);
    if (existing) {
      throw new ProfileAlreadyExistsException(command.userId);
    }

    const profile = Profile.create(
      {
        id: randomUUID(),
        userId: command.userId,
        displayName: command.displayName,
        profileType: command.profileType,
        firstName: command.firstName,
        lastName: command.lastName,
        timezone: command.timezone,
        locale: command.locale,
      },
      randomUUID(), // eventId
    );

    await this.profileRepository.save(profile);

    // Log domain events — real publishing comes in Step 13
    for (const event of profile.getDomainEvents()) {
      this.logger.log(
        `Domain event raised: ${event.eventType} [${event.eventId}]`,
      );
    }
    profile.clearDomainEvents();

    return profile.id;
  }
}
