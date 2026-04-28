import type { Result } from '../../kernel/result.js';

export const LEARNING_CLIENT = Symbol('ILearningClient');

export interface CreateSubmissionInput {
  assignmentId: string | null;
  exerciseId: string;
  userId: string;
  attemptId: string;
  submittedAnswer: unknown;
  timeSpentSeconds: number;
}

export interface CreateSubmissionOutput {
  submissionId: string;
}

export class LearningClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LearningClientError';
  }
}

export interface ILearningClient {
  createSubmission(
    input: CreateSubmissionInput,
  ): Promise<Result<CreateSubmissionOutput, LearningClientError>>;
}
