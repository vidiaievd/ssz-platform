import { Inject, Logger, Optional } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  MEDIA_ASSETS,
  type IMediaAssets,
} from '../../../../../shared/application/ports/media-assets.port.js';
import { GetSoundSessionItemsQuery } from './get-sound-session-items.query.js';
import { SoundSessionLoader, type LoadSessionError } from '../../session-loader.js';
import { SOUND_DRILL_READER, type ISoundDrillReader, type SoundBaseText } from '../../ports/sound-session.ports.js';
import { currentStep, type CurrentStep } from '../../../domain/session-step.js';
import type { MaterialWord, SessionPlan } from '../../../domain/session-plan.js';
import { sessionView, type SoundSessionView } from '../../session-view.js';

/** A reference clip of a word of the step, as a link the client plays. Signed for a while, never stored. */
export interface StepClip {
  word: string;
  url: string;
  mimeType: string;
  expiresAt: string;
}

/**
 * What the session says about the sound without a model (§5.2): the base texts in the learner's
 * locale. `commonError` is for readers of Russian and Ukrainian only, `ukNote` for Ukrainian only —
 * the same rule as `pronunciation_explain@2` (step 9.2).
 */
export interface StepInstruction {
  atomId: string;
  locale: string;
  title: string;
  howTo: string | null;
  drill: string | null;
  commonError: string | null;
  ukNote: string | null;
}

export interface SoundSessionItems {
  session: SoundSessionView;
  /** The clips of the step: its word, both words of a pair, the carrier words of a line that have one. */
  clips: StepClip[];
  /** Null in the diagnostic (it measures cold), once done, and when content-service is away. */
  instruction: StepInstruction | null;
}

/**
 * The step in front of the learner, with what is needed to take it (plan 86, step 13.4d): the
 * reference clips as signed links and the instruction of the base. Read at every step — the
 * links expire, and the step after a take is known only from its answer.
 *
 * The clips and the instruction are best effort: media-service or content-service away leaves
 * them out, and the learner can still record the step (Q26: a line has no clip of its own anyway).
 */
@QueryHandler(GetSoundSessionItemsQuery)
export class GetSoundSessionItemsHandler implements IQueryHandler<GetSoundSessionItemsQuery> {
  private readonly logger = new Logger(GetSoundSessionItemsHandler.name);

  constructor(
    private readonly sessions: SoundSessionLoader,
    @Inject(SOUND_DRILL_READER) private readonly drill: ISoundDrillReader,
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
  ) {}

  async execute(query: GetSoundSessionItemsQuery): Promise<Result<SoundSessionItems, LoadSessionError>> {
    const loaded = await this.sessions.load(query.attemptId, query.userId);
    if (loaded.isFail) return Result.fail(loaded.error);
    const { plan, state } = loaded.value;

    const session = sessionView(loaded.value, false);
    const step = state.phase === 'done' || loaded.value.attempt.status !== 'IN_PROGRESS' ? null : currentStep(plan, state);
    if (!step) return Result.ok({ session: { ...session, step: null }, clips: [], instruction: null });

    const [clips, instruction] = await Promise.all([
      this.clipsOf(stepWords(step)),
      step.phase === 'drill' ? this.instructionOf(plan, step.atomId, query.locale) : Promise.resolve(null),
    ]);
    return Result.ok({ session, clips, instruction });
  }

  private async clipsOf(words: MaterialWord[]): Promise<StepClip[]> {
    if (words.length === 0 || this.media === null) return [];
    const played = await this.media.playback(words.map((w) => w.assetId));
    if (played.isFail) {
      this.logger.warn(`Clips of a session step unavailable: ${played.error.message}`);
      return [];
    }
    const byId = new Map(played.value.map((p) => [p.id, p]));
    return words.flatMap((w) => {
      const p = byId.get(w.assetId);
      return p ? [{ word: w.word, url: p.url, mimeType: p.mimeType, expiresAt: p.expiresAt }] : [];
    });
  }

  private async instructionOf(plan: SessionPlan, atomId: string, locale: string): Promise<StepInstruction | null> {
    const base = await this.drill.base(plan.language, locale);
    if (base.isFail) return null;
    const entry = base.value.find((b) => b.atomId === atomId);
    return entry ? instructionFor(entry, locale) : null;
  }
}

/** The words whose clips the step plays; a phrase carrier without a clip has none to play. */
export function stepWords(step: CurrentStep): MaterialWord[] {
  if (step.phase === 'diagnostic') return [step.word];
  const e = step.element;
  if (e.kind === 'word') return [e.word];
  if (e.kind === 'pair') return [...e.words];
  return [];
}

export function instructionFor(entry: SoundBaseText, locale: string): StepInstruction {
  const reader = locale.toLowerCase().split(/[-_]/)[0] ?? '';
  return {
    atomId: entry.atomId,
    locale: entry.locale,
    title: entry.title,
    howTo: entry.howTo,
    drill: entry.drill,
    commonError: reader === 'ru' || reader === 'uk' ? entry.commonError : null,
    ukNote: reader === 'uk' ? entry.ukNote : null,
  };
}
