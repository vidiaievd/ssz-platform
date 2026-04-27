import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CONTENT_CLIENT } from '../../shared/application/ports/content-client.port.js';
import { LEARNING_CLIENT } from '../../shared/application/ports/learning-client.port.js';
import { ORGANIZATION_CLIENT } from '../../shared/application/ports/organization-client.port.js';
import { HttpContentClient } from './http-content-client.js';
import { HttpLearningClient } from './http-learning-client.js';
import { HttpOrganizationClient } from './http-organization-client.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    HttpContentClient,
    { provide: CONTENT_CLIENT, useExisting: HttpContentClient },
    HttpLearningClient,
    { provide: LEARNING_CLIENT, useExisting: HttpLearningClient },
    HttpOrganizationClient,
    { provide: ORGANIZATION_CLIENT, useExisting: HttpOrganizationClient },
  ],
  exports: [CONTENT_CLIENT, LEARNING_CLIENT, ORGANIZATION_CLIENT],
})
export class HttpClientsModule {}
