import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../config/configuration.js';

const { verify } = jwt;

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[]; // normalized — always an array regardless of token format
  iat: number;
  exp: number;
}

@Injectable()
export class JwtVerifierService {
  private readonly publicKey: string;

  constructor(config: ConfigService<Env>) {
    const raw = config.get('JWT_PUBLIC_KEY') as string;
    this.publicKey = raw.replace(/\\n/g, '\n');
  }

  verifyToken(token: string): JwtPayload {
    try {
      const raw = verify(token, this.publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;

      // jsonwebtoken deserializes repeated claims as a string (single) or array (multiple).
      // Normalize to always be an array so callers never need to handle both cases.
      const rawRoles = raw['role'] ?? raw['roles'] ?? [];
      const roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];

      return {
        sub: raw['sub'] as string,
        email: raw['email'] as string,
        roles: roles as string[],
        iat: raw['iat'] as number,
        exp: raw['exp'] as number,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
