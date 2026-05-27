import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import type { IStudentProfileRepository } from '../../../../students/domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../../students/domain/repositories/student-profile.repository.interface.js';
import type { ITutorProfileRepository } from '../../../../tutors/domain/repositories/tutor-profile.repository.interface.js';
import { TUTOR_PROFILE_REPOSITORY } from '../../../../tutors/domain/repositories/tutor-profile.repository.interface.js';
import { ProfileDto } from '../../dto/profile.dto.js';
import { GetProfileByUserIdQuery } from './get-profile-by-user-id.query.js';

@QueryHandler(GetProfileByUserIdQuery)
export class GetProfileByUserIdHandler implements IQueryHandler<
  GetProfileByUserIdQuery,
  ProfileDto
> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
    @Inject(TUTOR_PROFILE_REPOSITORY)
    private readonly tutorProfileRepository: ITutorProfileRepository,
  ) {}

  async execute(query: GetProfileByUserIdQuery): Promise<ProfileDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) {
      throw new ProfileNotFoundException(query.userId);
    }

    const [studentProfile, tutorProfile] = await Promise.all([
      this.studentProfileRepository.findByProfileId(profile.id),
      this.tutorProfileRepository.findByProfileId(profile.id),
    ]);

    const dto = new ProfileDto();
    dto.id = profile.id;
    dto.userId = profile.userId;
    dto.displayName = profile.displayName;
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.avatarUrl = profile.avatarUrl;
    dto.bio = profile.bio;
    dto.timezone = profile.timezone;
    dto.uiLocale = profile.uiLocale;
    dto.createdAt = profile.createdAt;
    dto.updatedAt = profile.updatedAt;
    dto.hasStudentProfile = studentProfile !== null;
    dto.hasTutorProfile = tutorProfile !== null;
    return dto;
  }
}
