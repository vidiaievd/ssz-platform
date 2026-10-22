import type { AdminRun } from '../../application/admin-payer.resolver.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';

/**
 * A platform_admin runs the `translate` review prompt on a submission they paste in — the
 * way to read the model's drafts by eye before any attempt is wired to it (plan 79, step 1.1).
 */
export class TryTranslateReviewCommand implements AdminRun {
  constructor(
    readonly input: TranslateReviewInput,
    readonly actorUserId: string,
    readonly asPayer: AdminRun['asPayer'] = null,
  ) {}
}
