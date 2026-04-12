import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProfileAlreadyExistsException } from '../../modules/profiles/domain/exceptions/profile-already-exists.exception.js';
import { ProfileNotFoundException } from '../../modules/profiles/domain/exceptions/profile-not-found.exception.js';
import { StudentProfileAlreadyExistsException } from '../../modules/students/domain/exceptions/student-profile-already-exists.exception.js';
import { StudentProfileNotFoundException } from '../../modules/students/domain/exceptions/student-profile-not-found.exception.js';
import { TutorProfileAlreadyExistsException } from '../../modules/tutors/domain/exceptions/tutor-profile-already-exists.exception.js';
import { TutorProfileNotFoundException } from '../../modules/tutors/domain/exceptions/tutor-profile-not-found.exception.js';

// Maps domain exceptions to HTTP responses.
// Infrastructure errors (unexpected) bubble up as 500 via NestJS default handler.
@Catch(
  ProfileNotFoundException,
  ProfileAlreadyExistsException,
  StudentProfileNotFoundException,
  StudentProfileAlreadyExistsException,
  TutorProfileNotFoundException,
  TutorProfileAlreadyExistsException,
)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, code } = this.resolve(exception);

    this.logger.warn(`Domain exception: ${exception.message}`);

    response.status(status).json({
      error: {
        code,
        message: exception.message,
      },
    });
  }

  private resolve(exception: Error): { status: number; code: string } {
    if (exception instanceof ProfileNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'PROFILE_NOT_FOUND' };
    }
    if (exception instanceof ProfileAlreadyExistsException) {
      return { status: HttpStatus.CONFLICT, code: 'PROFILE_ALREADY_EXISTS' };
    }
    if (exception instanceof StudentProfileNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'STUDENT_PROFILE_NOT_FOUND' };
    }
    if (exception instanceof StudentProfileAlreadyExistsException) {
      return { status: HttpStatus.CONFLICT, code: 'STUDENT_PROFILE_ALREADY_EXISTS' };
    }
    if (exception instanceof TutorProfileNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'TUTOR_PROFILE_NOT_FOUND' };
    }
    if (exception instanceof TutorProfileAlreadyExistsException) {
      return { status: HttpStatus.CONFLICT, code: 'TUTOR_PROFILE_ALREADY_EXISTS' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR' };
  }
}
