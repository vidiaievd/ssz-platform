import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../../config/configuration.js';
import type { MemberRole } from '../domain/value-objects/member-role.vo.js';

const { sign, verify } = jwt;

export interface InvitationTokenPayload {
  jti: string;        // invitation record ID
  schoolId: string;
  role: MemberRole;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class InvitationTokenService {
  constructor(private readonly config: ConfigService<Env>) {}

  sign(
    invitationId: string,
    schoolId: string,
    role: MemberRole,
    email: string,
    expiresAt: Date,
  ): string {
    const secret = this.config.get('INVITATION_JWT_SECRET') as string;
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return sign({ schoolId, role, email }, secret, {
      algorithm: 'HS256',
      jwtid: invitationId,
      expiresIn: ttlSeconds,
    });
  }

  verify(token: string): InvitationTokenPayload {
    const secret = this.config.get('INVITATION_JWT_SECRET') as string;
    return verify(token, secret, { algorithms: ['HS256'] }) as InvitationTokenPayload;
  }
}
