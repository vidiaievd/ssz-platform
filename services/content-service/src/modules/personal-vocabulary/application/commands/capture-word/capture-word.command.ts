import type { EntryContext } from '../../../domain/entities/personal-vocabulary-entry.entity.js';

export class CaptureWordCommand {
  constructor(
    public readonly userId: string,
    /** Language of the text the word was selected in. */
    public readonly targetLanguage: string,
    /** The student's language — what a translation is written in and looked up by. */
    public readonly translationLanguage: string,
    public readonly surfaceForm: string,
    /** The student's own translation; null when they leave the field empty. */
    public readonly translation: string | null,
    public readonly context: EntryContext | null,
  ) {}
}
