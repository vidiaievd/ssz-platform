import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { ProfileNotFoundException } from '../../../domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { UpdateProfileCommand } from './update-profile.command.js';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: UpdateProfileCommand): Promise<void> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      throw new ProfileNotFoundException(command.userId);
    }

    profile.updateBasicInfo(
      {
        displayName: command.displayName,
        firstName: command.firstName,
        lastName: command.lastName,
        avatarUrl: command.avatarUrl,
        bio: command.bio,
        timezone: command.timezone,
        locale: command.locale,
      },
      randomUUID(),
    );

    await this.profileRepository.save(profile);

    for (const event of profile.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    profile.clearDomainEvents();
  }
}
