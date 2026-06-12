import { ConflictException } from '@nestjs/common';

export class TeachingProfileAlreadyExistsException extends ConflictException {
  constructor(profileId: string) {
    super(`Teaching profile already exists for profile ${profileId}`);
  }
}
