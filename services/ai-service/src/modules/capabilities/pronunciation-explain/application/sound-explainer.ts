import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiGateway, type GatewayCall } from '../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import { languageName } from '../../review-draft/domain/comment-language.js';
import { EMPTY_SOUND_BASE, explanationsFromBase, soundBaseFor, type SoundBase } from '../domain/sound-base.js';
import { readExplanations, type SoundExplanations, type SoundToExplain } from '../domain/sound-explanations.js';
import { pronunciationExplainRequest } from '../prompts/prompts.js';
import { SOUND_BASE_READER, type ISoundBaseReader } from './ports/sound-base.reader.js';

export interface ExplainSounds {
  /** `pronunciation_explain` in a rehearsal or a sentence drill, `voice_review_explain` on hand-in. */
  capability: string;
  context: CallContext;
  /** The language read, as a code (`nb`): the catalogue it names. */
  targetLanguage: string;
  /** The language the learner reads explanations in, as a code (`uk`); `en` when nothing better is known. */
  explanationLanguage: string;
  sounds: SoundToExplain[];
  /** What the log says was not explained: «a rehearsed reading», «a sentence». */
  what: string;
}

/**
 * The weak sounds of one hearing explained by a model, all in one call (plan 88, step 5b), with
 * the articulation base of content-service (plan 86, step 9.2) in the learner's language. The
 * same for the rehearsal, the sentence drill and the hand-in: only the agent's code differs.
 *
 * Never fails beyond the call itself. A base that cannot be read is an empty one, and the model
 * gets the inventory's notes exactly as before step 9.2. Null explanations when the model did
 * not answer usably — off, refused, failed — and then the base's lines in the learner's language,
 * where it has them; the remarks keep the inventory's note only where it has none.
 */
@Injectable()
export class SoundExplainer {
  private readonly logger = new Logger(SoundExplainer.name);

  constructor(
    private readonly gateway: AiGateway,
    @Inject(SOUND_BASE_READER) private readonly bases: ISoundBaseReader,
  ) {}

  /**
   * `explanations` is the model's answer; `fromBase`, only when the model gave none, is the base's
   * «how to say it» in the learner's language (null when the base has none in it). Callers show
   * `explanations ?? fromBase`, but count only `explanations` as explained by the model.
   */
  async explain(
    ask: ExplainSounds,
  ): Promise<{ call: GatewayCall; explanations: SoundExplanations | null; fromBase: SoundExplanations | null }> {
    const base = await this.baseOf(ask.targetLanguage, ask.explanationLanguage);
    const input = {
      targetLanguage: languageName(ask.targetLanguage),
      explanationLanguage: languageName(ask.explanationLanguage),
      sounds: ask.sounds,
      base,
    };
    const call = await this.gateway.call(ask.capability, ask.context, (promptVersion) =>
      pronunciationExplainRequest(promptVersion, input),
    );
    const unexplained = () => ({
      call,
      explanations: null,
      fromBase: explanationsFromBase(ask.sounds, base, primarySubtag(ask.explanationLanguage)),
    });
    if (call.routed.isFail) {
      // Off is a choice (no binding yet), not a failure worth a line per try.
      if (call.routed.error.kind !== 'disabled') this.logger.warn(`Sounds of ${ask.what} not explained: ${call.routed.error.kind}`);
      return unexplained();
    }
    const { output } = call.routed.value.result;
    if (output.kind !== 'structured') return unexplained();
    return { call, explanations: readExplanations(output.data, ask.sounds.length), fromBase: null };
  }

  private async baseOf(language: string, explanationLanguage: string): Promise<SoundBase> {
    const locale = primarySubtag(explanationLanguage);
    try {
      return soundBaseFor(await this.bases.base(language, locale), locale);
    } catch (err) {
      this.logger.warn(
        `Articulation base of ${language} (${locale}) unreadable; explaining from the inventory: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return EMPTY_SOUND_BASE;
    }
  }
}

/** `nb-NO` → `nb`: the catalogue's texts are kept per language, not per region. */
function primarySubtag(code: string): string {
  return code.split(/[-_]/)[0]!.toLowerCase();
}
