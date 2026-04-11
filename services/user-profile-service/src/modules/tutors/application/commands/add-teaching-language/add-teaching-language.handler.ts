import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TutorProfileNotFoundException } from '../../../domain/exceptions/tutor-profile-not-found.exception.js';
import type { ITutorProfileRepository } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { TUTOR_PROFILE_REPOSITORY } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { AddTeachingLanguageCommand } from './add-teaching-language.command.js';

@CommandHandler(AddTeachingLanguageCommand)
export class AddTeachingLanguageHandler implements ICommandHandler<AddTeachingLanguageCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(TUTOR_PROFILE_REPOSITORY)
    private readonly tutorProfileRepository: ITutorProfileRepository,
  ) {}

  async execute(command: AddTeachingLanguageCommand): Promise<void> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      throw new ProfileNotFoundException(command.userId);
    }

    const tutorProfile = await this.tutorProfileRepository.findByProfileId(
      profile.id,
    );
    if (!tutorProfile) {
      throw new TutorProfileNotFoundException(profile.id);
    }

    tutorProfile.addTeachingLanguage({
      languageCode: command.languageCode,
      proficiency: command.proficiency,
    });
    await this.tutorProfileRepository.save(tutorProfile);
  }
}
