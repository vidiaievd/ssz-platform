import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

// Placeholder — fully implemented in Step 10.
// Verifies school membership roles via Organization Service.
@Injectable()
export class HttpOrganizationClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}
}
