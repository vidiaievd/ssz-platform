import { Module } from '@nestjs/common';
import { ReviewTermJournalConsumer } from './consumers/review-term-journal.consumer.js';

/** School work a model's verdict closed at the school's term, and who let it (plan 80, step 6). */
@Module({
  providers: [ReviewTermJournalConsumer],
})
export class ReviewTermsModule {}
