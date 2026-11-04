import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GroupPause, GroupPitch } from '@ssz/shared-kernel/prosody';
import { tokenize } from '@ssz/shared-kernel/text';
import type { Token } from '@ssz/shared-kernel/text';

import type { AppConfig } from '../../../../config/configuration.js';
import type { SuggestionRefusal } from '../../domain/prosody-error.js';
import type {
  IPhraseMarksSuggester,
  PhraseMarksRequest,
  PhraseMarksSuggestion,
  SuggestedPhraseMarks,
} from '../../application/ports/phrase-marks.suggester.js';

/** What ai-service answers — always a 200, the outcome in `status`; marks by span index. */
interface Answer {
  status?: 'ok' | 'refused' | 'failed';
  marks?: {
    accents: number[];
    boundaries: { index: number; pitch: GroupPitch; pause: GroupPause | null }[];
    links: number[];
  };
  reason?: SuggestionRefusal;
  errorCode?: string;
}

/**
 * ai-service's `POST /api/v1/internal/prosody/phrase-marks` behind `x-internal-token`. As for the
 * lexicon's stresses, the words are counted here and sent as spans, and the answer comes back
 * by span: the anchors are this service's. The call waits on a model, so it has a timeout of
 * its own (`AI_SERVICE_SUGGESTION_TIMEOUT_MS`), under the gateway's for the route.
 */
@Injectable()
export class HttpPhraseMarksSuggester implements IPhraseMarksSuggester {
  private readonly logger = new Logger(HttpPhraseMarksSuggester.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const ai = config.get<AppConfig['ai']>('ai')!;
    this.baseUrl = ai.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = ai.suggestionTimeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async suggest(request: PhraseMarksRequest): Promise<PhraseMarksSuggestion> {
    const tokens = tokenize(request.text);
    let answer: Answer;
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/internal/prosody/phrase-marks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ ...request, spans: tokens.map((t) => [t.s, t.e]) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Phrase marks not suggested: ai-service answered HTTP ${response.status}`);
        return { status: 'failed', errorCode: `http_${response.status}` };
      }
      answer = (await response.json()) as Answer;
    } catch (err) {
      this.logger.warn(
        `Phrase marks not suggested: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'failed', errorCode: 'unreachable' };
    }

    if (answer.status === 'ok' && answer.marks) {
      return { status: 'ok', marks: anchored(answer.marks, tokens) };
    }
    if (answer.status === 'refused' && answer.reason) {
      return { status: 'refused', reason: answer.reason };
    }
    return { status: 'failed', errorCode: answer.errorCode ?? 'invalid_response' };
  }
}

/** Span indices → anchors `{ i, w }`; an index outside the text is dropped. */
function anchored(
  marks: NonNullable<Answer['marks']>,
  tokens: readonly Token[],
): SuggestedPhraseMarks {
  const at = (index: number) => {
    const token = tokens[index];
    return token ? { i: token.i, w: token.w } : null;
  };
  return {
    accents: marks.accents.flatMap((index) => {
      const anchor = at(index);
      return anchor ? [{ ...anchor, source: 'ai' as const }] : [];
    }),
    boundaries: marks.boundaries.flatMap(({ index, pitch, pause }) => {
      const anchor = at(index);
      return anchor ? [{ ...anchor, pitch, pause, source: 'ai' as const }] : [];
    }),
    links: marks.links.flatMap((index) => {
      const first = at(index);
      const second = at(index + 1);
      return first && second
        ? [{ i: first.i, w: `${first.w} ${second.w}`, source: 'ai' as const }]
        : [];
    }),
  };
}
