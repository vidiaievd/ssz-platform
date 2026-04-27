import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

// Placeholder — fully implemented in Step 10.
// Routes free-form submissions to Learning Service for tutor review.
@Injectable()
export class HttpLearningClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}
}
