/**
 * What an author marked a stretch of lesson text as.
 *
 * VOCAB and GRAMMAR point at an existing entity (a vocabulary item / a grammar
 * rule); CHUNK is self-contained — a multi-word expression the author wants
 * noticed, explained by its own `note` rather than by a catalogued referent.
 */
export enum LessonSpanKind {
  VOCAB = 'vocab',
  GRAMMAR = 'grammar',
  CHUNK = 'chunk',
}
