import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Optional } from '@nestjs/common';
import {
  fromPersisted,
  maxTries,
  TEMPLATE_CODE as MINIMAL_PAIRS,
  toProbeView,
} from '@ssz/shared-kernel/minimal-pairs';
import type { ProbeOption, Provenance } from '@ssz/shared-kernel/minimal-pairs';
import { HandOutProbeCommand } from './hand-out-probe.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  MEDIA_ASSETS,
  type IMediaAssets,
} from '../../../../../shared/application/ports/media-assets.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  closedResults,
  currentProbe,
  drawOf,
  playbackOf,
  probeStatesOf,
} from '../../services/minimal-pairs-sitting.js';

export type HandOutProbeError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** Not a `minimal_pairs` attempt, or one that drew nothing. */
  | { code: 'NOT_A_PROBE_SET' }
  | { code: 'NOT_IN_PROGRESS' }
  /** Every probe is closed: the sitting is waiting for `/submit`. */
  | { code: 'ALL_PROBES_CLOSED' }
  /** The probe's clip cannot be played right now; nothing was recorded. */
  | { code: 'MEDIA_UNAVAILABLE' }
  | ContentClientError;

export interface HandedOutProbe {
  /** 1-based place of this probe in the sitting. */
  n: number;
  total: number;
  /** What `/answers` names this probe by. */
  questionId: string;
  clip: {
    url: string;
    expiresAt: string;
    durationMs: number;
    provenance: Provenance;
    dialect: string;
  };
  /** The buttons, in the order drawn for this sitting. Spelled only as the author allows. */
  options: ProbeOption[];
  /** Answers already given to this probe — one, on a second chance — and whether it is closed. */
  state: { tries: number; maxTries: number; closed: boolean };
  /** How each probe before this one went on its first answer: the runner's pips after a reload. */
  closedProbes: Array<{ n: number; correct: boolean }>;
}

/**
 * The current probe of a sitting: its clip as a link to play, and its buttons.
 *
 * Which word the clip is does not go out — that is the answer. Neither does any word's
 * spelling unless the author shows spelling «always», nor its meaning unless meaning is shown
 * «always» (the kernel's `toProbeView`). The link is signed now and dies within the hour; the
 * document only ever holds the asset id (plan 56 §3.1).
 *
 * The probe handed out is always the first one not closed, so there is no way to ask for a
 * later one: a client that skipped ahead would be skipping the clip, not the answer. A probe
 * whose clip media-service cannot sign is refused with nothing recorded, rather than handed out
 * silent — an answer to a sound nobody heard is a guess, and a guess would be scored.
 */
@CommandHandler(HandOutProbeCommand)
export class HandOutProbeHandler implements ICommandHandler<HandOutProbeCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
  ) {}

  async execute(command: HandOutProbeCommand): Promise<Result<HandedOutProbe, HandOutProbeError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== command.userId) return Result.fail({ code: 'FORBIDDEN' });

    const draw = drawOf(attempt);
    if (attempt.templateCode !== MINIMAL_PAIRS || draw.length === 0) {
      return Result.fail({ code: 'NOT_A_PROBE_SET' });
    }
    if (attempt.status !== 'IN_PROGRESS') return Result.fail({ code: 'NOT_IN_PROGRESS' });

    const states = probeStatesOf(attempt);
    const probe = currentProbe(draw, states);
    if (!probe) return Result.fail({ code: 'ALL_PROBES_CLOSED' });

    // PRACTICE whatever the attempt is: the words and the clips are the content column, and a
    // graded envelope arrives projected without them. Nothing of it goes back but the view.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) return Result.fail(defResult.error);
    const document = fromPersisted(defResult.value.exercise.content, defResult.value.exercise.expectedAnswers);

    // A probe whose word the author has since deleted cannot be played. The draw is the
    // attempt's and is not redrawn under it; the student would be stuck on a probe with no
    // clip, so it is reported like a clip that cannot be signed.
    const view = toProbeView(document, probe, draw.length);
    if (view === null) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });

    const links = await playbackOf(this.media, [view.clip.assetId]);
    const link = links.get(view.clip.assetId);
    if (!link) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });

    const state = states.find((s) => s.n === probe.n);
    return Result.ok({
      n: view.n,
      total: view.total,
      questionId: view.questionId,
      clip: {
        url: link.url,
        expiresAt: link.expiresAt,
        // The server's measurement where it has one; the length the builder copied in otherwise.
        durationMs: link.durationMs ?? view.clip.durationMs,
        provenance: view.clip.provenance,
        dialect: view.clip.dialect,
      },
      options: view.options,
      state: {
        tries: state?.picks.length ?? 0,
        maxTries: maxTries(document.feedback, attempt.checkMode === 'GRADED'),
        closed: false,
      },
      closedProbes: closedResults(draw, states),
    });
  }
}
