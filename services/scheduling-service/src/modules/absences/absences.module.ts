import { Module } from '@nestjs/common';
import { SubstituteRequestGeneratorService } from './application/services/substitute-request-generator.service.js';
import { AbsencesController } from './presentation/controllers/absences.controller.js';

@Module({
  controllers: [AbsencesController],
  providers: [SubstituteRequestGeneratorService],
  exports: [SubstituteRequestGeneratorService],
})
export class AbsencesModule {}
