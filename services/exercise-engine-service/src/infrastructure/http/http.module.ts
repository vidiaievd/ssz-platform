import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HttpContentClient } from './http-content-client.js';
import { HttpOrganizationClient } from './http-organization-client.js';
import { HttpLearningClient } from './http-learning-client.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [HttpContentClient, HttpOrganizationClient, HttpLearningClient],
  exports: [HttpContentClient, HttpOrganizationClient, HttpLearningClient],
})
export class HttpClientsModule {}
