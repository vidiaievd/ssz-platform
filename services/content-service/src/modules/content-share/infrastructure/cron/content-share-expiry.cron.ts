import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CONTENT_SHARE_REPOSITORY } from '../../domain/repositories/content-share.repository.interface.js';
import type { IContentShareRepository } from '../../domain/repositories/content-share.repository.interface.js';

@Injectable()
export class ContentShareExpiryCron {
  private readonly logger = new Logger(ContentShareExpiryCron.name);

  constructor(
    @Inject(CONTENT_SHARE_REPOSITORY) private readonly shareRepo: IContentShareRepository,
  ) {}

  // Daily at 03:00 Europe/Oslo
  @Cron('0 3 * * *', { timeZone: 'Europe/Oslo' })
  async expireShares(): Promise<void> {
    const now = new Date();
    this.logger.log('Running content share expiry cron');

    const expired = await this.shareRepo.findExpiredAndNotRevoked(now);
    if (expired.length === 0) {
      this.logger.log('No expired shares found');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const share of expired) {
      const result = share.revoke('expired');
      if (result.isFail) {
        this.logger.warn(`Could not revoke share ${share.id}: ${result.error}`);
        errorCount++;
        continue;
      }
      try {
        await this.shareRepo.save(share);
        successCount++;
      } catch (err) {
        this.logger.error(`Failed to persist revocation for share ${share.id}`, err);
        errorCount++;
      }
    }

    this.logger.log(
      `Share expiry cron complete — revoked: ${successCount}, errors: ${errorCount}, total: ${expired.length}`,
    );
  }
}
