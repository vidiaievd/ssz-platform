import { Injectable, Logger } from '@nestjs/common';
import type {
  ExerciseDefinition,
  IContentClient,
} from '../../shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../shared/application/ports/content-client.port.js';
import { Result } from '../../shared/kernel/result.js';
import { ExerciseDefinitionCache } from './exercise-definition-cache.js';
import { HttpContentClient } from '../http/http-content-client.js';

@Injectable()
export class CachedContentClient implements IContentClient {
  private readonly logger = new Logger(CachedContentClient.name);

  constructor(
    private readonly cache: ExerciseDefinitionCache,
    private readonly http: HttpContentClient,
  ) {}

  async getExerciseForAttempt(
    exerciseId: string,
    language: string,
  ): Promise<Result<ExerciseDefinition, ContentClientError>> {
    const cached = await this.cache.get(exerciseId, language);
    if (cached) {
      this.logger.debug(`Cache HIT: exercise ${exerciseId} lang=${language}`);
      return Result.ok(cached);
    }

    this.logger.debug(`Cache MISS: exercise ${exerciseId} lang=${language}`);
    const result = await this.http.getExerciseForAttempt(exerciseId, language);

    if (result.isOk) {
      await this.cache.set(exerciseId, language, result.value);
    }

    return result;
  }
}
