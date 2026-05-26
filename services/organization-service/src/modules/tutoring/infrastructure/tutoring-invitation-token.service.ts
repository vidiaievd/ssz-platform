import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../../config/configuration.js';

const { sign, verify } = jwt;

export interface TutoringInvitationTokenPayload {
  jti: string;
  tutorGroupId: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class TutoringInvitationTokenService {
  constructor(private readonly config: ConfigService<Env>) {}

  sign(
    invitationId: string,
    tutorGroupId: string,
    email: string,
    expiresAt: Date,
  ): string {
    const secret = this.config.get('INVITATION_JWT_SECRET') as string;
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return sign({ tutorGroupId, email }, secret, {
      algorithm: 'HS256',
      jwtid: invitationId,
      expiresIn: ttlSeconds,
    });
  }

  verify(token: string): TutoringInvitationTokenPayload {
    const secret = this.config.get('INVITATION_JWT_SECRET') as string;
    return verify(token, secret, { algorithms: ['HS256'] }) as TutoringInvitationTokenPayload;
  }
}
