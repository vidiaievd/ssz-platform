import { Injectable, Logger } from '@nestjs/common';
import type {
  CheckMode,
  ExerciseDefinition,
  IContentClient,
  PracticedAtomRef,
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
    mode: CheckMode,
  ): Promise<Result<ExerciseDefinition, ContentClientError>> {
    const cached = await this.cache.get(exerciseId, language, mode);
    if (cached) {
      this.logger.debug(`Cache HIT: exercise ${exerciseId} lang=${language} mode=${mode}`);
      return Result.ok(cached);
    }

    this.logger.debug(`Cache MISS: exercise ${exerciseId} lang=${language} mode=${mode}`);
    const result = await this.http.getExerciseForAttempt(exerciseId, language, mode);

    if (result.isOk) {
      await this.cache.set(exerciseId, language, mode, result.value);
    }

    return result;
  }

  // Not cached — fetched once per attempt start, and the relation graph changes
  // rarely enough that a stale cache isn't worth the complexity here.
  async getPracticedAtoms(
    exerciseId: string,
  ): Promise<Result<PracticedAtomRef[], ContentClientError>> {
    return this.http.getPracticedAtoms(exerciseId);
  }
}
