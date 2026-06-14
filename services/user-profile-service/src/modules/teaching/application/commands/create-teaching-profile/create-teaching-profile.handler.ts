import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTeachingProfileCommand } from './create-teaching-profile.command.js';
import { PROFILE_REPOSITORY, type IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TEACHING_PROFILE_REPOSITORY, type ITeachingProfileRepository } from '../../../domain/repositories/teaching-profile.repository.interface.js';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import { TeachingProfileAlreadyExistsException } from '../../../domain/exceptions/teaching-profile-already-exists.exception.js';
import { TeachingProfile } from '../../../domain/entities/teaching-profile.entity.js';

@CommandHandler(CreateTeachingProfileCommand)
export class CreateTeachingProfileHandler implements ICommandHandler<CreateTeachingProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: IProfileRepository,
    @Inject(TEACHING_PROFILE_REPOSITORY) private readonly teachingProfileRepository: ITeachingProfileRepository,
  ) {}

  async execute(command: CreateTeachingProfileCommand): Promise<string> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) throw new ProfileNotFoundException(command.userId);

    const existing = await this.teachingProfileRepository.findByProfileId(profile.id);
    if (existing) throw new TeachingProfileAlreadyExistsException(profile.id);

    const teachingProfile = TeachingProfile.create({ id: randomUUID(), profileId: profile.id });
    await this.teachingProfileRepository.save(teachingProfile);
    return teachingProfile.id;
  }
}
