import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ProsodyError } from '../domain/prosody-error.js';

export function throwProsodyError(error: ProsodyError): never {
  switch (error.code) {
    case 'OWNER_NOT_FOUND':
    case 'PROMPT_NOT_FOUND':
      throw new NotFoundException({ message: error.code });
    case 'NOT_A_TEXT_LESSON':
    case 'NOT_READ_ALOUD':
    case 'PROMPT_HAS_NO_TEXT':
      throw new UnprocessableEntityException({ message: error.code });
    case 'NOTATION_INVALID':
    case 'LAYER_INVALID':
      throw new BadRequestException({ message: error.code, issues: error.issues });
  }
}
