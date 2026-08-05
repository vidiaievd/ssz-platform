export enum ExerciseDomainError {
  EXERCISE_NOT_FOUND = 'EXERCISE_NOT_FOUND',
  INSTRUCTION_NOT_FOUND = 'INSTRUCTION_NOT_FOUND',
  INVALID_EXERCISE_CONTENT = 'INVALID_EXERCISE_CONTENT',
  INVALID_EXERCISE_ANSWERS = 'INVALID_EXERCISE_ANSWERS',
  INVALID_VISIBILITY_FOR_OWNER_TYPE = 'INVALID_VISIBILITY_FOR_OWNER_TYPE',
  DUPLICATE_INSTRUCTION_LANGUAGE = 'DUPLICATE_INSTRUCTION_LANGUAGE',
  EXERCISE_ALREADY_DELETED = 'EXERCISE_ALREADY_DELETED',
  EXERCISE_HAS_PUBLISHED_CONTAINER_REFERENCES = 'EXERCISE_HAS_PUBLISHED_CONTAINER_REFERENCES',
  // Exercise soft-delete is always allowed even when the exercise is in grammar pools.
  // Pool entries remain after deletion; the random-exercise endpoint skips deleted exercises.
  EXERCISE_IN_GRAMMAR_POOL = 'EXERCISE_IN_GRAMMAR_POOL',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  // Someone else saved the exercise between the author's read and their write.
  // Reported rather than merged: `content` and `expected_answers` are replaced
  // wholesale on update, so the later write would silently take the earlier
  // author's text with it.
  EXERCISE_MODIFIED_ELSEWHERE = 'EXERCISE_MODIFIED_ELSEWHERE',
}
