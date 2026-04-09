import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { ProfileNotFoundException } from '../../../domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import { UpdateProfileCommand } from './update-profile.command.js';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand> {
  private readonly logger = new Logger(UpdateProfileHandler.name);

  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
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
      randomUUID(), // eventId
    );

    await this.profileRepository.save(profile);

    for (const event of profile.getDomainEvents()) {
      this.logger.log(
        `Domain event raised: ${event.eventType} [${event.eventId}]`,
      );
    }
    profile.clearDomainEvents();
  }
}
