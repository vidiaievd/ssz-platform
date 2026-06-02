import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../../config/configuration.js';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  roles: string[];
  isPlatformAdmin: boolean;
}

const { verify, decode } = jwt;

@Injectable()
export class JwtVerifierService {
  private readonly logger = new Logger(JwtVerifierService.name);
  private readonly publicKey: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt');
    const raw = jwtConfig?.publicKey;

    if (!raw) {
      this.logger.warn('JWT_PUBLIC_KEY not configured — auth will fail for all requests');
      this.publicKey = '';
      return;
    }

    this.publicKey = raw.replace(/\\n/g, '\n');
    const lines = this.publicKey.split('\n').filter(Boolean);
    this.logger.log(`JWT public key loaded — ${lines.length} lines`);
  }

  verify(token: string): AuthenticatedUser {
    const decoded = decode(token, { complete: true });
    this.logger.debug(
      `Verifying token — alg: ${decoded?.header?.alg ?? 'unknown'}, ` +
        `sub: ${(decoded?.payload as Record<string, unknown>)?.['sub'] ?? 'unknown'}`,
    );

    try {
      const raw = verify(token, this.publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;

      const rawRoles = raw['role'] ?? raw['roles'] ?? [];
      const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles]) as string[];

      return {
        userId: raw['sub'] as string,
        email: raw['email'] as string | undefined,
        roles,
        isPlatformAdmin: roles.includes('platform_admin'),
      };
    } catch (err) {
      throw new UnauthorizedException(`Token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
