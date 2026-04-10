import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { Profile } from '../../../domain/entities/profile.entity.js';
import { ProfileAlreadyExistsException } from '../../../domain/exceptions/profile-already-exists.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { CreateProfileCommand } from './create-profile.command.js';

@CommandHandler(CreateProfileCommand)
export class CreateProfileHandler implements ICommandHandler<CreateProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
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
      randomUUID(),
    );

    await this.profileRepository.save(profile);

    // Publish all domain events raised during entity creation
    for (const event of profile.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    profile.clearDomainEvents();

    return profile.id;
  }
}
