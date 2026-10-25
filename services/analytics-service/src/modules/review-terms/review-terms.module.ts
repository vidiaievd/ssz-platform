import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OrganizationClient } from '../../infrastructure/http/organization.client.js';
import { ReviewTermJournalConsumer } from './consumers/review-term-journal.consumer.js';
import { ReviewTermsController } from './controllers/review-terms.controller.js';
import {
  GetSchoolReviewTermsHandler,
  GetTeacherReviewTermsHandler,
} from './queries/get-school-review-terms.handler.js';
import { ReviewTermReader } from './queries/review-term-reader.js';

/** School work a model's verdict closed at the school's term, and who let it (plan 80, step 6). */
@Module({
  imports: [CqrsModule],
  controllers: [ReviewTermsController],
  providers: [
    ReviewTermJournalConsumer,
    // Reading the journal per school and per teacher (6b).
    OrganizationClient,
    ReviewTermReader,
    GetSchoolReviewTermsHandler,
    GetTeacherReviewTermsHandler,
  ],
})
export class ReviewTermsModule {}
