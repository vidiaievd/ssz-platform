import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TutorProfile } from '../../../domain/entities/tutor-profile.entity.js';
import { TutorProfileAlreadyExistsException } from '../../../domain/exceptions/tutor-profile-already-exists.exception.js';
import type { ITutorProfileRepository } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { TUTOR_PROFILE_REPOSITORY } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { CreateTutorProfileCommand } from './create-tutor-profile.command.js';

@CommandHandler(CreateTutorProfileCommand)
export class CreateTutorProfileHandler implements ICommandHandler<CreateTutorProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(TUTOR_PROFILE_REPOSITORY)
    private readonly tutorProfileRepository: ITutorProfileRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateTutorProfileCommand): Promise<string> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      throw new ProfileNotFoundException(command.userId);
    }

    const existing = await this.tutorProfileRepository.findByProfileId(profile.id);
    if (existing) {
      throw new TutorProfileAlreadyExistsException(profile.id);
    }

    const tutorProfile = TutorProfile.create(
      {
        id: randomUUID(),
        profileId: profile.id,
        hourlyRate: command.hourlyRate,
        yearsOfExperience: command.yearsOfExperience,
      },
      randomUUID(),
    );

    await this.tutorProfileRepository.save(tutorProfile);

    for (const event of tutorProfile.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    tutorProfile.clearDomainEvents();

    return tutorProfile.id;
  }
}
