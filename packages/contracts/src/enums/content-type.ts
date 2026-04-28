export const ContentType = {
  CONTAINER: 'container',
  LESSON: 'lesson',
  VOCABULARY_LIST: 'vocabulary_list',
  GRAMMAR_RULE: 'grammar_rule',
  EXERCISE: 'exercise',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];
