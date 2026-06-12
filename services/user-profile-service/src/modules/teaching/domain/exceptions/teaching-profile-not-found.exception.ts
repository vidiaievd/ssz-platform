import { NotFoundException } from '@nestjs/common';

export class TeachingProfileNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super(`Teaching profile not found: ${identifier}`);
  }
}
