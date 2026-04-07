import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;   // userId (UUID)
  email: string;
  role: string;  // student | tutor | school_admin | platform_admin
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  // Cached public key string — read once from config
  private readonly publicKey: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.publicKey = this.configService.get<string>('jwt.publicKey') as string;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      // Verify the JWT using the RSA public key — no call to Auth Service needed
      const payload = this.jwtService.verify<JwtPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
      });

      // Attach the parsed payload to the request so controllers can access it
      request.user = payload;
      return true;
    } catch (error) {
      this.logger.debug(`JWT verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}
