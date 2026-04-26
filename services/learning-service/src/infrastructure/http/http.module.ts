import { Global, Module } from '@nestjs/common';
import {
  CONTENT_CLIENT,
} from '../../shared/application/ports/content-client.port.js';
import {
  ORGANIZATION_CLIENT,
} from '../../shared/application/ports/organization-client.port.js';
import { ContentClient } from './content-client.js';
import { OrganizationClient } from './organization-client.js';

@Global()
@Module({
  providers: [
    ContentClient,
    { provide: CONTENT_CLIENT, useExisting: ContentClient },
    OrganizationClient,
    { provide: ORGANIZATION_CLIENT, useExisting: OrganizationClient },
  ],
  exports: [CONTENT_CLIENT, ORGANIZATION_CLIENT],
})
export class HttpClientsModule {}
