import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../config/configuration.js';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
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
      const payload = verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as JwtPayload;

      this.logger.debug(`Token verified successfully for sub: ${payload.sub}`);
      return payload;
    } catch (err) {
      this.logger.warn(
        `Token verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
