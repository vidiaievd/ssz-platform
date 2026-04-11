import { Global, Module } from '@nestjs/common';
import { JwtVerifierService } from './jwt-verifier.service.js';

// @Global so JwtVerifierService is available for JwtAuthGuard
// without re-importing this module everywhere.
@Global()
@Module({
  providers: [JwtVerifierService],
  exports: [JwtVerifierService],
})
export class AuthModule {}
