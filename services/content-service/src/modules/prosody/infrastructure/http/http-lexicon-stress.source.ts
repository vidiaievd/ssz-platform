import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WordStress } from '@ssz/shared-kernel/prosody';
import { tokenize } from '@ssz/shared-kernel/text';

import type { AppConfig } from '../../../../config/configuration.js';
import type { ILexiconStressSource } from '../../application/ports/lexicon-stress.source.js';

/** What ai-service answers for each word it marks, by the index of the span sent. */
interface AnsweredStress {
  index: number;
  toneme: 1 | 2 | null;
  vowel: { s: number; e: number; long: boolean | null };
}

/**
 * ai-service's `POST /api/v1/internal/prosody/word-stresses` behind `x-internal-token`. The words
 * are counted here, by the kernel's tokenizer, and sent as spans: the anchors are this service's
 * to keep, ai-service only answers for them. ai-service caches by the text, so asking on every
 * student read is cheap.
 */
@Injectable()
export class HttpLexiconStressSource implements ILexiconStressSource {
  private readonly logger = new Logger(HttpLexiconStressSource.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const ai = config.get<AppConfig['ai']>('ai')!;
    this.baseUrl = ai.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = ai.timeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async stressesOf(language: string, text: string): Promise<WordStress[]> {
    const tokens = tokenize(text);
    if (tokens.length === 0) return [];
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/internal/prosody/word-stresses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ language, text, spans: tokens.map((t) => [t.s, t.e]) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Lexicon stresses not read: ai-service answered HTTP ${response.status}`);
        return [];
      }
      const body = (await response.json()) as { words?: AnsweredStress[] };
      return (body.words ?? []).flatMap((word) => {
        const token = tokens[word.index];
        if (!token || word.vowel.e > token.w.length) return [];
        return [
          {
            i: token.i,
            w: token.w,
            toneme: word.toneme,
            vowel: word.vowel,
            source: 'lexicon' as const,
          },
        ];
      });
    } catch (err) {
      this.logger.warn(
        `Lexicon stresses not read: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}
