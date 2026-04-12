import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { StudentProfile } from '../../../domain/entities/student-profile.entity.js';
import { StudentProfileAlreadyExistsException } from '../../../domain/exceptions/student-profile-already-exists.exception.js';
import type { IStudentProfileRepository } from '../../../domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../domain/repositories/student-profile.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { CreateStudentProfileCommand } from './create-student-profile.command.js';

@CommandHandler(CreateStudentProfileCommand)
export class CreateStudentProfileHandler implements ICommandHandler<CreateStudentProfileCommand> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateStudentProfileCommand): Promise<string> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      throw new ProfileNotFoundException(command.userId);
    }

    const existing = await this.studentProfileRepository.findByProfileId(profile.id);
    if (existing) {
      throw new StudentProfileAlreadyExistsException(profile.id);
    }

    const studentProfile = StudentProfile.create(
      {
        id: randomUUID(),
        profileId: profile.id,
        nativeLanguage: command.nativeLanguage,
      },
      randomUUID(),
    );

    await this.studentProfileRepository.save(studentProfile);

    for (const event of studentProfile.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    studentProfile.clearDomainEvents();

    return studentProfile.id;
  }
}
