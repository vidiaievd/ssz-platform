import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  GIVE_UP_REASONS,
  type GiveUpReason,
} from '../../application/commands/give-up-ai-review/give-up-ai-review.command.js';

/** Why ai-service gives up on a learner's work (plan 79, step 2.2a). */
export class GiveUpAiReviewDto {
  /** `refused` — the gate said no; `unaskable` — nothing to ask; `failed` — no model answered usably. */
  @IsIn(GIVE_UP_REASONS)
  reason!: GiveUpReason;

  @IsOptional()
  @IsUUID()
  aiCallId?: string | null;
}
