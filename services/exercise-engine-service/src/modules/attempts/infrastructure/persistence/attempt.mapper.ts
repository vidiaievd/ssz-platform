import type { AttemptModel } from '../../../../../generated/prisma/models/Attempt.js';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import type { AttemptStatus, DifficultyLevel } from '../../domain/entities/attempt.entity.js';

export class AttemptMapper {
  static toDomain(row: AttemptModel): Attempt {
    return Attempt.reconstitute({
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      assignmentId: row.assignmentId,
      enrollmentId: row.enrollmentId,
      templateCode: row.templateCode,
      targetLanguage: row.targetLanguage,
      difficultyLevel: row.difficultyLevel as DifficultyLevel,
      status: row.status as AttemptStatus,
      score: row.score,
      passed: row.passed,
      timeSpentSeconds: row.timeSpentSeconds,
      submittedAnswer: row.submittedAnswer,
      validationDetails: row.validationDetails,
      feedback: row.feedback,
      answerHash: row.answerHash,
      revisionCount: row.revisionCount,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      scoredAt: row.scoredAt,
    });
  }

  static toPersistence(attempt: Attempt): AttemptModel {
    return {
      id: attempt.id,
      userId: attempt.userId,
      exerciseId: attempt.exerciseId,
      assignmentId: attempt.assignmentId,
      enrollmentId: attempt.enrollmentId,
      templateCode: attempt.templateCode,
      targetLanguage: attempt.targetLanguage,
      difficultyLevel: attempt.difficultyLevel as AttemptModel['difficultyLevel'],
      status: attempt.status as AttemptModel['status'],
      score: attempt.scoreValue,
      passed: attempt.passed,
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAnswer: attempt.submittedAnswer ?? null,
      validationDetails: attempt.validationDetails ?? null,
      feedback: attempt.feedback ?? null,
      answerHash: attempt.answerHash,
      revisionCount: attempt.revisionCount,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      scoredAt: attempt.scoredAt,
    };
  }
}
