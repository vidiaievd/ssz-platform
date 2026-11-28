import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ITonemeMeasurementRecorder,
  TonemeMeasurement,
} from '../application/ports/toneme-measurement.recorder.js';

@Injectable()
export class PrismaTonemeMeasurementRecorder implements ITonemeMeasurementRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(m: TonemeMeasurement): Promise<void> {
    await this.prisma.tonemeMeasurement.createMany({
      data: [
        {
          aiCallId: m.aiCallId,
          language: m.language,
          word: m.word,
          tone: m.tone,
          learnerScore: m.learnerScore,
          learnerFrameRange: m.learnerFrameRange,
          referenceScore: m.referenceScore,
          referenceFrameRange: m.referenceFrameRange,
          referenceVoice: m.referenceVoice,
          verdict: m.verdict,
          sessionId: m.sessionId,
          measuredAt: m.measuredAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}
