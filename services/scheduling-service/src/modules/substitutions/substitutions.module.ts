import { Module } from '@nestjs/common';
import { CandidateRankingService } from './application/services/candidate-ranking.service.js';
import { SubstitutionsController } from './presentation/controllers/substitutions.controller.js';
import { SlotsModule } from '../slots/slots.module.js';
import { ProfileServiceHttpClient } from '../../infrastructure/profile/profile-service.http-client.js';

@Module({
  imports: [SlotsModule],
  controllers: [SubstitutionsController],
  providers: [CandidateRankingService, ProfileServiceHttpClient],
  exports: [CandidateRankingService],
})
export class SubstitutionsModule {}
