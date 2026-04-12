import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../config/configuration.js';

export interface JwtPayload {
  sub: string;    // userId
  email: string;
  roles: string[]; // normalized — always an array regardless of token format
}

const { verify, decode } = jwt;

@Injectable()
export class JwtVerifierService {
  private readonly logger = new Logger(JwtVerifierService.name);
  private readonly publicKey: string;

  constructor(config: ConfigService<Env>) {
    const raw = config.get('JWT_PUBLIC_KEY');
    if (!raw) {
      throw new Error('JWT_PUBLIC_KEY is not configured');
    }
    // .env stores the PEM with literal \n — replace them with real newlines
    this.publicKey = raw.replace(/\\n/g, '\n');

    // Log first/last line of the key so we can confirm it loaded correctly
    const lines = this.publicKey.split('\n').filter(Boolean);
    this.logger.log(
      `Public key loaded — first line: "${lines[0]}", last line: "${lines[lines.length - 1]}", total lines: ${lines.length}`,
    );
  }

  verify(token: string): JwtPayload {
    // Decode without verification first — lets us log the header/payload for debugging
    const decoded = decode(token, { complete: true });
    this.logger.debug(
      `Incoming token — algorithm: ${decoded?.header?.alg ?? 'unknown'}, ` +
        // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
        `sub: ${(decoded?.payload as Record<string, unknown>)?.sub ?? 'unknown'}, ` +
        // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
        `exp: ${(decoded?.payload as Record<string, unknown>)?.exp ?? 'unknown'}`,
    );

    try {
      const raw = verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as Record<string, unknown>;

      // jsonwebtoken deserializes repeated claims as a string (single) or array (multiple).
      // Normalize to always be an array so callers never need to handle both cases.
      const rawRoles = raw['role'] ?? raw['roles'] ?? [];
      const roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];

      const payload: JwtPayload = {
        sub: raw['sub'] as string,
        email: raw['email'] as string,
        roles: roles as string[],
      };

      this.logger.debug(
        `Token verified successfully for sub: ${payload.sub}, roles: [${payload.roles.join(', ')}]`,
      );
      return payload;
    } catch (err) {
      this.logger.warn(
        `Token verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
