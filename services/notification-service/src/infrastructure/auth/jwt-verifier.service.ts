import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../../config/configuration.js';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

const { verify } = jwt;

@Injectable()
export class JwtVerifierService {
  private readonly logger = new Logger(JwtVerifierService.name);
  private readonly publicKey: string;

  constructor(config: ConfigService<AppConfig>) {
    const raw = config.get<AppConfig['jwt']>('jwt')?.publicKey;
    if (!raw) throw new Error('JWT_PUBLIC_KEY is not configured');
    this.publicKey = raw.replace(/\\n/g, '\n');
  }

  verify(token: string): JwtPayload {
    try {
      const raw = verify(this.publicKey ? token : token, this.publicKey, {
        algorithms: ['RS256'],
      }) as Record<string, unknown>;

      const rawRoles = raw['role'] ?? raw['roles'] ?? [];
      const roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];

      return { sub: raw['sub'] as string, email: raw['email'] as string, roles: roles as string[] };
    } catch (err) {
      this.logger.warn(`Token verification failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
