import { ConflictException } from '@nestjs/common';

export class TeachingLanguageAlreadyExistsException extends ConflictException {
  constructor(code: string) {
    super(`Teaching language already added: ${code}`);
  }
}
