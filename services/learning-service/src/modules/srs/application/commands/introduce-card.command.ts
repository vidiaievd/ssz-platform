import type { SrsContentType } from '../../domain/entities/review-card.entity.js';

export class IntroduceCardCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: SrsContentType,
    public readonly contentId: string,
  ) {}
}
