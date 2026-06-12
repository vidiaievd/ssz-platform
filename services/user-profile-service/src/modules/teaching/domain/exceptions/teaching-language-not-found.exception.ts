import { NotFoundException } from '@nestjs/common';

export class TeachingLanguageNotFoundException extends NotFoundException {
  constructor(code: string) {
    super(`Teaching language not found: ${code}`);
  }
}
