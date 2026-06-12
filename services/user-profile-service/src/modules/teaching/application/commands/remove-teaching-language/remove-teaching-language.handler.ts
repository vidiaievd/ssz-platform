import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RemoveTeachingLanguageCommand } from './remove-teaching-language.command.js';
import { PROFILE_REPOSITORY, type IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TEACHING_PROFILE_REPOSITORY, type ITeachingProfileRepository } from '../../domain/repositories/teaching-profile.repository.interface.js';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import { TeachingProfileNotFoundException } from '../../domain/exceptions/teaching-profile-not-found.exception.js';
import { TeachingLanguageNotFoundException } from '../../domain/exceptions/teaching-language-not-found.exception.js';

@CommandHandler(RemoveTeachingLanguageCommand)
export class RemoveTeachingLanguageHandler implements ICommandHandler<RemoveTeachingLanguageCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: IProfileRepository,
    @Inject(TEACHING_PROFILE_REPOSITORY) private readonly teachingProfileRepository: ITeachingProfileRepository,
  ) {}

  async execute(command: RemoveTeachingLanguageCommand): Promise<void> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) throw new ProfileNotFoundException(command.userId);

    const teachingProfile = await this.teachingProfileRepository.findByProfileId(profile.id);
    if (!teachingProfile) throw new TeachingProfileNotFoundException(command.userId);

    const removed = teachingProfile.removeLanguage(command.code);
    if (!removed) throw new TeachingLanguageNotFoundException(command.code);

    await this.teachingProfileRepository.save(teachingProfile);
  }
}
