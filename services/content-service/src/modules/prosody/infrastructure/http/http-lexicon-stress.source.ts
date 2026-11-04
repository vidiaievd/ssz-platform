import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { segsCoverWord } from '@ssz/shared-kernel/prosody';
import type { ProsodyAnchor, SoundSeg, WordSounds, WordStress } from '@ssz/shared-kernel/prosody';
import { tokenize } from '@ssz/shared-kernel/text';

import type { AppConfig } from '../../../../config/configuration.js';
import type { ILexiconStressSource, LexiconWords } from '../../application/ports/lexicon-stress.source.js';

/** What ai-service answers for each word it marks, by the index of the span sent. */
interface AnsweredStress {
  index: number;
  toneme: 1 | 2 | null;
  vowel: { s: number; e: number; long: boolean | null };
}

/** The letters of a word over its sounds, by the index of the span sent (step 6d). */
interface AnsweredSounds {
  index: number;
  segs: SoundSeg[];
}

const KINDS = new Set(['vowel', 'consonant', 'silent']);

/** A sound answer is kept only if it lies over exactly the letters of its word, in a kind the kernel knows. */
function fits(segs: unknown, length: number): segs is SoundSeg[] {
  return (
    Array.isArray(segs) &&
    segs.every(
      (x) => typeof x === 'object' && x !== null && KINDS.has(x.kind) && Array.isArray(x.sounds),
    ) &&
    segsCoverWord(segs as SoundSeg[], length)
  );
}

const NONE: LexiconWords = { stresses: [], sounds: [], unresolved: [] };

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

  async wordsOf(language: string, text: string): Promise<LexiconWords> {
    const tokens = tokenize(text);
    if (tokens.length === 0) return NONE;
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/internal/prosody/word-stresses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ language, text, spans: tokens.map((t) => [t.s, t.e]) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Lexicon words not read: ai-service answered HTTP ${response.status}`);
        return NONE;
      }
      const body = (await response.json()) as {
        words?: AnsweredStress[];
        sounds?: AnsweredSounds[];
        unresolved?: number[];
      };
      const stresses = (body.words ?? []).flatMap((word): WordStress[] => {
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
      const sounds = (body.sounds ?? []).flatMap((word): WordSounds[] => {
        const token = tokens[word.index];
        if (!token || !fits(word.segs, token.w.length)) return [];
        return [{ i: token.i, w: token.w, segs: word.segs }];
      });
      // Step 6h.2; an older ai-service does not send it, and then nothing is asked of the author.
      const unresolved = (body.unresolved ?? []).flatMap((index): ProsodyAnchor[] => {
        const token = Number.isInteger(index) ? tokens[index] : undefined;
        return token ? [{ i: token.i, w: token.w }] : [];
      });
      return { stresses, sounds, unresolved };
    } catch (err) {
      this.logger.warn(
        `Lexicon words not read: ${err instanceof Error ? err.message : String(err)}`,
      );
      return NONE;
    }
  }
}
