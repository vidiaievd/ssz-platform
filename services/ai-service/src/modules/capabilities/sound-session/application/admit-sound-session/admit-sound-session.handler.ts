import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AppConfig } from '../../../../../config/configuration.js';
import type { GateGrant } from '../../../../access/application/access-gate.js';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway } from '../../../../gateway/application/ai-gateway.js';
import { formatMicroCredits, microCredits } from '../../../../ledger/domain/credits.js';
import { PRACTICE_VOICE } from '../../../practice/practice.capability.js';
import type { AdmitSoundSessionOutcome, SoundSessionBudget } from '../../domain/sound-session.js';
import { SOUND_SESSION_LIMITER, type ISoundSessionLimiter } from '../ports/sound-session.limiter.js';
import { AdmitSoundSessionCommand, type AdmitSoundSessionRequest } from './admit-sound-session.command.js';

/**
 * Whether a learner may begin a pronunciation session now, and what it may cost the payer
 * (plan 86, step 14.1, Q32 + §5.5a).
 *
 * The gate first (the agent's switch, then the payer's policy, tariff and pool) — a payer without `ai.practice`, or with its credits spent, is told so before a
 * session of the day is counted: those are not the learner's sessions to lose. Then the day's
 * count (`AI_SOUND_SESSION_DAILY_LIMIT`, an abuse guard, not a tariff). A learner on a small plan
 * is let in whatever is left: the budget comes back for the client's warning (§5.5a), and a pool
 * that runs dry mid-session stops it with what was measured.
 *
 * A resumed session is neither counted nor refused for the day or the pool — it is the learner's
 * already, and must at least be handed in. Nothing is called, nothing written but Redis.
 */
@CommandHandler(AdmitSoundSessionCommand)
export class AdmitSoundSessionHandler implements ICommandHandler<AdmitSoundSessionCommand, AdmitSoundSessionOutcome> {
  private readonly estimatedCredits: string;

  constructor(
    private readonly gateway: AiGateway,
    @Inject(SOUND_SESSION_LIMITER) private readonly limiter: ISoundSessionLimiter,
    config: ConfigService<AppConfig>,
  ) {
    this.estimatedCredits = formatMicroCredits(microCredits(config.get<AppConfig['soundSession']>('soundSession')!.estimatedCredits));
  }

  async execute({ request }: AdmitSoundSessionCommand): Promise<AdmitSoundSessionOutcome> {
    const payer = payerOf(request);
    const checked = await this.gateway.standing(PRACTICE_VOICE.code, payer);
    if (checked.isFail) {
      const failure = checked.error;
      if (failure.kind === 'gate_unavailable') return { status: 'failed', errorCode: 'gate_unavailable' };
      if (failure.kind === 'disabled' || failure.code !== 'quota_exhausted') return { status: 'refused', reason: 'not_available', retryAfterMs: null };
      if (!request.resume) return { status: 'refused', reason: 'pool_empty', retryAfterMs: null };
      return { status: 'admitted', budget: this.spent(payer) };
    }

    if (!request.resume) {
      const begun = await this.limiter.begin(request.userId);
      if (!begun.allowed) return { status: 'refused', reason: 'session_limit', retryAfterMs: begun.retryAfterMs };
    }
    return { status: 'admitted', budget: this.budget(payer, checked.value) };
  }

  private budget(payer: Payer, grant: GateGrant): SoundSessionBudget {
    const feature = grant.feature;
    const metered = feature !== null && feature.monthlyCredits !== null;
    const remaining = grant.quota ? grant.quota.limitMicro - grant.quota.usedMicro : null;
    return {
      payer: payer.type === 'user' ? 'learner' : 'school',
      metered,
      remainingCredits: metered && remaining !== null ? formatMicroCredits(remaining > 0n ? remaining : 0n) : null,
      estimatedCredits: this.estimatedCredits,
      periodEnd: metered ? feature!.periodEnd.toISOString() : null,
    };
  }

  /** A resumed session of a payer whose pool is spent: nothing left, the period unknown here. */
  private spent(payer: Payer): SoundSessionBudget {
    return {
      payer: payer.type === 'user' ? 'learner' : 'school',
      metered: true,
      remainingCredits: formatMicroCredits(0n),
      estimatedCredits: this.estimatedCredits,
      periodEnd: null,
    };
  }
}

/** The school when there is one, else the learner under their own plan — as a take is paid. */
function payerOf(request: AdmitSoundSessionRequest): Payer {
  return request.schoolId === null ? { type: 'user', id: request.userId } : { type: 'workspace', id: request.schoolId };
}
