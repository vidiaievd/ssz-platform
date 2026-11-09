// What a stored prosody layer belongs to (plan 86, step 5). A lesson layer covers the whole
// body of a TEXT variant; an exercise layer covers one `read_aloud` prompt's passage.
//
// `lessonId` travels with the variant because the access guard checks the lesson in the
// path, not the variant: a variant of another lesson must not be reachable through it.

export type ProsodyOwner =
  | { kind: 'lesson'; lessonId: string; variantId: string }
  | { kind: 'exercise'; exerciseId: string; promptId: string };

/** Which document of an exercise: what students are served, or the author's unreleased edit. */
export type ExerciseScope = 'live' | 'draft';
