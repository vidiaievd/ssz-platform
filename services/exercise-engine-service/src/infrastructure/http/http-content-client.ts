import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

// Placeholder — fully implemented in Step 10.
// Fetches exercise + template + instructions from Content Service.
@Injectable()
export class HttpContentClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}
}
