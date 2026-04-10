import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { SchoolNotFoundException } from '../../modules/schools/domain/exceptions/school-not-found.exception.js';
import { SchoolAlreadyExistsException } from '../../modules/schools/domain/exceptions/school-already-exists.exception.js';
import { ForbiddenOperationException } from '../../modules/schools/domain/exceptions/forbidden-operation.exception.js';
import { MemberAlreadyExistsException } from '../../modules/schools/domain/exceptions/member-already-exists.exception.js';
import { InvitationNotFoundException } from '../../modules/schools/domain/exceptions/invitation-not-found.exception.js';

@Catch(
  SchoolNotFoundException,
  SchoolAlreadyExistsException,
  ForbiddenOperationException,
  MemberAlreadyExistsException,
  InvitationNotFoundException,
)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, code } = this.resolve(exception);

    this.logger.warn(`Domain exception: ${exception.message}`);

    response.status(status).json({
      error: { code, message: exception.message },
    });
  }

  private resolve(exception: Error): { status: number; code: string } {
    if (exception instanceof SchoolNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'SCHOOL_NOT_FOUND' };
    }
    if (exception instanceof SchoolAlreadyExistsException) {
      return { status: HttpStatus.CONFLICT, code: 'SCHOOL_ALREADY_EXISTS' };
    }
    if (exception instanceof ForbiddenOperationException) {
      return { status: HttpStatus.FORBIDDEN, code: 'FORBIDDEN_OPERATION' };
    }
    if (exception instanceof MemberAlreadyExistsException) {
      return { status: HttpStatus.CONFLICT, code: 'MEMBER_ALREADY_EXISTS' };
    }
    if (exception instanceof InvitationNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'INVITATION_NOT_FOUND' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR' };
  }
}
