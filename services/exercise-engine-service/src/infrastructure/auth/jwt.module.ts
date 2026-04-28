import { Global, Module } from '@nestjs/common';
import { JwtVerifierService } from './jwt-verifier.service.js';

@Global()
@Module({
  providers: [JwtVerifierService],
  exports: [JwtVerifierService],
})
export class JwtModule {}
