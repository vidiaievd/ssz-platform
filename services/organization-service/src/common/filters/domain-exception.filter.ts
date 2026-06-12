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
import { InvitationAlreadyAcceptedException } from '../../modules/schools/domain/exceptions/invitation-already-accepted.exception.js';
import { InvitationRevokedException } from '../../modules/schools/domain/exceptions/invitation-revoked.exception.js';
import { InvitationExpiredException } from '../../modules/schools/domain/exceptions/invitation-expired.exception.js';
import { InvitationResendThrottledException } from '../../modules/schools/domain/exceptions/invitation-resend-throttled.exception.js';
import { InvitationAlreadyPendingException } from '../../modules/schools/domain/exceptions/invitation-already-pending.exception.js';
import { TutoringInvitationAlreadyAcceptedException } from '../../modules/tutoring/domain/exceptions/invitation-already-accepted.exception.js';
import { TutoringInvitationRevokedException } from '../../modules/tutoring/domain/exceptions/invitation-revoked.exception.js';
import { TutoringInvitationExpiredException } from '../../modules/tutoring/domain/exceptions/invitation-expired.exception.js';
import { TutoringInvitationResendThrottledException } from '../../modules/tutoring/domain/exceptions/invitation-resend-throttled.exception.js';
import { InvitationNotFoundException as TutoringInvitationNotFoundException } from '../../modules/tutoring/domain/exceptions/invitation-not-found.exception.js';
import { MemberNotFoundException } from '../../modules/schools/domain/exceptions/member-not-found.exception.js';

@Catch(
  SchoolNotFoundException,
  MemberNotFoundException,
  SchoolAlreadyExistsException,
  ForbiddenOperationException,
  MemberAlreadyExistsException,
  InvitationNotFoundException,
  TutoringInvitationNotFoundException,
  InvitationAlreadyAcceptedException,
  InvitationRevokedException,
  InvitationExpiredException,
  InvitationResendThrottledException,
  InvitationAlreadyPendingException,
  TutoringInvitationAlreadyAcceptedException,
  TutoringInvitationRevokedException,
  TutoringInvitationExpiredException,
  TutoringInvitationResendThrottledException,
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
    if (exception instanceof MemberNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'MEMBER_NOT_FOUND' };
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
    if (exception instanceof InvitationNotFoundException || exception instanceof TutoringInvitationNotFoundException) {
      return { status: HttpStatus.NOT_FOUND, code: 'INVITATION_NOT_FOUND' };
    }
    if (
      exception instanceof InvitationAlreadyAcceptedException ||
      exception instanceof TutoringInvitationAlreadyAcceptedException
    ) {
      return { status: HttpStatus.CONFLICT, code: 'INVITATION_ALREADY_ACCEPTED' };
    }
    if (
      exception instanceof InvitationRevokedException ||
      exception instanceof TutoringInvitationRevokedException
    ) {
      return { status: HttpStatus.GONE, code: 'INVITATION_REVOKED' };
    }
    if (
      exception instanceof InvitationExpiredException ||
      exception instanceof TutoringInvitationExpiredException
    ) {
      return { status: HttpStatus.GONE, code: 'INVITATION_EXPIRED' };
    }
    if (
      exception instanceof InvitationResendThrottledException ||
      exception instanceof TutoringInvitationResendThrottledException
    ) {
      return { status: HttpStatus.TOO_MANY_REQUESTS, code: 'RESEND_THROTTLED' };
    }
    if (exception instanceof InvitationAlreadyPendingException) {
      return { status: HttpStatus.CONFLICT, code: 'INVITATION_ALREADY_PENDING' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR' };
  }
}
