import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { Env } from '../../config/configuration.js';

const { verify } = jwt;

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
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
      return verify(token, this.publicKey, { algorithms: ['RS256'] }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
