import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration.js';
import type {
  ClipSpan,
  IReferenceSynthesizer,
  ReferenceSynthesis,
  ReferenceTry,
} from '../../shared/application/ports/reference-synthesizer.port.js';

/** What ai-service answers on `POST /api/v1/internal/reference-clips` (plan 88, step 6b.2). */
interface ReferenceClipResponse {
  status?: unknown;
  clip?: {
    wav?: unknown;
    audioMs?: unknown;
    voice?: unknown;
    sentence?: unknown;
    word?: unknown;
    stressedVowel?: unknown;
  };
  tone?: unknown;
  reason?: unknown;
  errorCode?: unknown;
  tries?: unknown;
}

/**
 * ai-service's self-checked reference synthesis, behind `x-internal-token` (the shared internal
 * token). The path carries ai-service's `/api/v1` prefix. Every answer is a 200; `failed` — a
 * model or the pitch tracker did not answer — is thrown like an unreachable service.
 */
@Injectable()
export class HttpReferenceSynthesizer implements IReferenceSynthesizer {
  readonly provider = 'ai-service';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const ai = config.get<AppConfig['aiService']>('aiService')!;
    this.baseUrl = ai.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = ai.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as never)!;
  }

  async reference(word: string, lang: string): Promise<ReferenceSynthesis> {
    const res = await fetch(`${this.baseUrl}/api/v1/internal/reference-clips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
      body: JSON.stringify({ language: lang, word }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`ai-service responded ${res.status}`);
    return readAnswer((await res.json()) as ReferenceClipResponse);
  }
}

/** Exported for tests. */
export function readAnswer(body: ReferenceClipResponse): ReferenceSynthesis {
  const tone = body.tone === 1 || body.tone === 2 ? body.tone : null;
  const tries = Array.isArray(body.tries) ? (body.tries as ReferenceTry[]) : [];
  switch (body.status) {
    case 'ok': {
      const clip = body.clip;
      const word = spanOf(clip?.word);
      if (!clip || typeof clip.wav !== 'string' || typeof clip.voice !== 'string' || !word) {
        throw new Error('ai-service answered ok without a clip');
      }
      return {
        status: 'ok',
        tone,
        tries,
        clip: {
          wav: Buffer.from(clip.wav, 'base64'),
          audioMs: Number(clip.audioMs),
          voice: clip.voice,
          sentence: String(clip.sentence),
          word,
          stressedVowel: spanOf(clip.stressedVowel),
        },
      };
    }
    case 'rejected':
      return { status: 'rejected', tone, tries };
    case 'refused':
      return { status: 'refused', reason: String(body.reason) };
    default:
      throw new Error(
        `ai-service could not make the clip: ${String(body.errorCode ?? body.status)}`,
      );
  }
}

function spanOf(value: unknown): ClipSpan | null {
  const span = value as Partial<ClipSpan> | null | undefined;
  return span && typeof span.startMs === 'number' && typeof span.endMs === 'number'
    ? { startMs: span.startMs, endMs: span.endMs }
    : null;
}
