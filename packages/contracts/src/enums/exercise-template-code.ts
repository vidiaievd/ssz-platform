export const ExerciseTemplateCode = {
  MULTIPLE_CHOICE: 'multiple_choice',
  FILL_IN_BLANK: 'fill_in_blank',
  MATCH_PAIRS: 'match_pairs',
  ORDERING: 'ordering',
  TRANSLATE_TO_TARGET: 'translate_to_target',
  TRANSLATE_FROM_TARGET: 'translate_from_target',
} as const;

export type ExerciseTemplateCode = (typeof ExerciseTemplateCode)[keyof typeof ExerciseTemplateCode];
