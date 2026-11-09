import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../../../config/configuration.js';
import { Result } from '../../../../shared/kernel/result.js';
import type {
  DrillMaterial,
  LearnerSounds,
  MaterialPhrase,
  MaterialWord,
  SoundMaterial,
} from '../../domain/session-plan.js';
import {
  SoundSessionSourceError,
  type IRecordingDiscarder,
  type ILearnerSoundsReader,
  type ISoundDrillReader,
  type ISoundSessionAdmission,
  type ISoundTakeJudge,
  type SessionAdmission,
  type SoundBaseText,
  type TakePayer,
  type SoundTakeOutcome,
  type SoundTakeRequest,
  type TonemeTakeOutcome,
  type TonemeTakeRequest,
} from '../../application/ports/sound-session.ports.js';

type Source = SoundSessionSourceError['source'];

/** A failed call as the port reports it: the answered status, or 503 when the service was away. */
function sourceError(source: Source, err: unknown): SoundSessionSourceError {
  const status = isAxiosError(err) ? (err.response?.status ?? 503) : 500;
  return new SoundSessionSourceError(source, status, err instanceof Error ? err.message : String(err));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * learning-service `GET /api/v1/internal/learners/:userId/sound-atoms` (plan 86, step 13.1).
 *
 * learning's internal routes take `x-service-token`, not `x-internal-token` (same secret, other
 * header) — a wrong header is a 401 that reads like «no record» (memory: internal-token-header-differs).
 */
@Injectable()
export class HttpLearnerSoundsReader implements ILearnerSoundsReader {
  private readonly logger = new Logger(HttpLearnerSoundsReader.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['learning']>('learning')!;
    this.baseUrl = cfg.baseUrl;
    this.timeout = cfg.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  async read(userId: string, language: string): Promise<Result<LearnerSounds, SoundSessionSourceError>> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<unknown>(
          `${this.baseUrl}/api/v1/internal/learners/${encodeURIComponent(userId)}/sound-atoms`,
          { params: { language }, headers: { 'x-service-token': this.token }, timeout: this.timeout },
        ),
      );
      if (!isObject(data) || !Array.isArray(data.cards) || !Array.isArray(data.flags)) {
        return Result.fail(new SoundSessionSourceError('learning', 502, 'learning-service answered without cards and flags'));
      }
      return Result.ok({
        cards: data.cards.filter(isObject).map((c) => ({ atomId: String(c.atomId), due: c.due === true })),
        flags: data.flags.filter(isObject).map((f) => ({
          atomId: String(f.atomId),
          days: typeof f.days === 'number' ? f.days : 0,
          lastFlaggedOn: typeof f.lastFlaggedOn === 'string' ? f.lastFlaggedOn : '',
          hasCard: f.hasCard === true,
        })),
      });
    } catch (err) {
      const error = sourceError('learning', err);
      this.logger.warn(`Sound atoms of learner ${userId} (${language}) → ${error.statusCode}: ${error.message}`);
      return Result.fail(error);
    }
  }
}

/** content-service `GET /api/v1/internal/sound-atoms/drill` (plan 86, step 13.2). */
@Injectable()
export class HttpSoundDrillReader implements ISoundDrillReader {
  private readonly logger = new Logger(HttpSoundDrillReader.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['content']>('content')!;
    this.baseUrl = cfg.baseUrl;
    this.timeout = cfg.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  async read(language: string, atomIds: readonly string[]): Promise<Result<DrillMaterial, SoundSessionSourceError>> {
    try {
      const params: Record<string, string> = { language };
      if (atomIds.length > 0) params.atomIds = atomIds.join(',');
      const { data } = await firstValueFrom(
        this.http.get<unknown>(`${this.baseUrl}/api/v1/internal/sound-atoms/drill`, {
          params,
          headers: { 'x-internal-token': this.token },
          timeout: this.timeout,
        }),
      );
      if (!isObject(data) || !Array.isArray(data.atoms) || !Array.isArray(data.diagnostic)) {
        return Result.fail(new SoundSessionSourceError('content', 502, 'content-service answered without a drill set'));
      }
      return Result.ok(toMaterial(data));
    } catch (err) {
      const error = sourceError('content', err);
      this.logger.warn(`Sound drill (${language}) → ${error.statusCode}: ${error.message}`);
      return Result.fail(error);
    }
  }

  async base(language: string, locale: string): Promise<Result<SoundBaseText[], SoundSessionSourceError>> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<unknown>(`${this.baseUrl}/api/v1/internal/sound-atoms`, {
          params: { language, locale },
          headers: { 'x-internal-token': this.token },
          timeout: this.timeout,
        }),
      );
      if (!isObject(data) || !Array.isArray(data.atoms)) {
        return Result.fail(new SoundSessionSourceError('content', 502, 'content-service answered without a sound catalogue'));
      }
      const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
      return Result.ok(
        data.atoms.filter(isObject).map((a) => ({
          atomId: String(a.atomId),
          locale: String(a.locale ?? locale),
          title: String(a.title ?? a.atomId),
          description: text(a.description),
          howTo: text(a.howTo),
          drill: text(a.drill),
          commonError: text(a.commonError),
          ukNote: text(a.ukNote),
        })),
      );
    } catch (err) {
      const error = sourceError('content', err);
      this.logger.warn(`Sound base (${language}, ${locale}) → ${error.statusCode}: ${error.message}`);
      return Result.fail(error);
    }
  }
}

/**
 * media-service `POST /api/v1/internal/media/assets/:assetId/discard` — the owner's take deleted
 * as the owner would delete it. Already gone counts as done.
 */
@Injectable()
export class HttpRecordingDiscarder implements IRecordingDiscarder {
  private readonly logger = new Logger(HttpRecordingDiscarder.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['media']>('media')!;
    this.baseUrl = cfg.baseUrl;
    this.timeout = cfg.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  async discard(assetId: string, ownerId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/api/v1/internal/media/assets/${encodeURIComponent(assetId)}/discard`,
          { ownerId },
          { headers: { 'x-internal-token': this.token }, timeout: this.timeout },
        ),
      );
      return true;
    } catch (err) {
      // Already deleted is what was asked for.
      const status = isAxiosError(err) ? (err.response?.status ?? 503) : 500;
      if (status === 404) return true;
      this.logger.warn(`Discarding take ${assetId} → ${status}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}

/**
 * content-service's drill set in the domain's shape. The service nests a word's clip
 * (`{ word, reference: { assetId, tone } }`); the plan holds it flat. A word or a pair member
 * without a clip is dropped (content-service already leaves those out — this only guards the
 * contract); a phrase carrier keeps a null clip, as content-service sends it.
 */
function toMaterial(data: Record<string, unknown>): DrillMaterial {
  const atoms = (data.atoms as unknown[]).filter(isObject).map(
    (a): SoundMaterial => ({
      atomId: String(a.atomId),
      family: String(a.family),
      words: arrayOf(a.words).flatMap((w) => wordOf(w) ?? []),
      pairs: arrayOf(a.pairs).flatMap((p): Array<[MaterialWord, MaterialWord]> => {
        if (!Array.isArray(p) || p.length !== 2) return [];
        const first = wordOf(p[0]);
        const second = wordOf(p[1]);
        return first && second ? [[first, second]] : [];
      }),
      phrases: arrayOf(a.phrases).flatMap((p): MaterialPhrase[] =>
        isObject(p) && typeof p.text === 'string'
          ? [
              {
                text: p.text,
                carriers: arrayOf(p.carriers).flatMap((c) =>
                  isObject(c) && typeof c.word === 'string'
                    ? [{ word: c.word, assetId: wordOf(c)?.assetId ?? null }]
                    : [],
                ),
                source: String(p.source ?? ''),
              },
            ]
          : [],
      ),
    }),
  );
  const diagnostic = (data.diagnostic as unknown[]).flatMap((d) => {
    const word = isObject(d) ? wordOf(d.word) : null;
    return word && isObject(d) ? [{ atomId: String(d.atomId), word }] : [];
  });
  return { language: String(data.language ?? ''), atoms, diagnostic };
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** `{ word, reference: { assetId, tone } }` → `{ word, assetId, tone }`; null without a clip. */
function wordOf(v: unknown): MaterialWord | null {
  if (!isObject(v) || typeof v.word !== 'string' || !isObject(v.reference)) return null;
  const { assetId, tone } = v.reference;
  if (typeof assetId !== 'string' || assetId === '') return null;
  return { word: v.word, assetId, tone: tone === 1 || tone === 2 ? tone : null };
}

const TAKE_OUTCOMES: ReadonlySet<string> = new Set(['ok', 'refused', 'failed']);
const TONEME_OUTCOMES: ReadonlySet<string> = new Set(['ok', 'unheard', 'refused', 'failed']);
const ADMISSION_OUTCOMES: ReadonlySet<string> = new Set(['admitted', 'refused', 'failed']);

/**
 * ai-service for a take of a session: `internal/sentence-checks` with a target (step 13.3) and
 * `internal/toneme-checks` (plan 88, step 8.3). No retry — the learner is waiting and the call
 * may already be billed. The timeout is ai-service's (a speech call). Also the session's door,
 * `internal/sound-sessions/admit` (step 14.1).
 */
@Injectable()
export class HttpSoundTakeJudge implements ISoundTakeJudge, ISoundSessionAdmission {
  private readonly logger = new Logger(HttpSoundTakeJudge.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['ai']>('ai')!;
    this.baseUrl = cfg.baseUrl;
    this.timeout = cfg.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  async sounds(request: SoundTakeRequest): Promise<Result<SoundTakeOutcome, SoundSessionSourceError>> {
    const result = await this.post<SoundTakeOutcome>('sentence-checks', request, TAKE_OUTCOMES, request.exerciseId);
    // An `ok` without a target is read as «not measured» by the session; normalised here so the
    // reader never meets `undefined`.
    return result.map((o) => (o.status === 'ok' ? { ...o, target: o.target ?? null } : o));
  }

  async toneme(request: TonemeTakeRequest): Promise<Result<TonemeTakeOutcome, SoundSessionSourceError>> {
    return this.post<TonemeTakeOutcome>('toneme-checks', request, TONEME_OUTCOMES, request.word);
  }

  async admit(request: TakePayer & { resume: boolean }): Promise<Result<SessionAdmission, SoundSessionSourceError>> {
    return this.post<SessionAdmission>('sound-sessions/admit', request, ADMISSION_OUTCOMES, request.userId);
  }

  private async post<T>(
    route: string,
    body: unknown,
    outcomes: ReadonlySet<string>,
    about: string,
  ): Promise<Result<T, SoundSessionSourceError>> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<T>(`${this.baseUrl}/api/v1/internal/${route}`, body, {
          headers: { 'x-internal-token': this.token },
          timeout: this.timeout,
        }),
      );
      if (!isObject(data) || !outcomes.has(data.status as string)) {
        return Result.fail(new SoundSessionSourceError('ai', 502, 'ai-service answered without an outcome'));
      }
      return Result.ok(data);
    } catch (err) {
      const error = sourceError('ai', err);
      this.logger.warn(`${route} [${about}] → ${error.statusCode}: ${error.message}`);
      return Result.fail(error);
    }
  }
}
