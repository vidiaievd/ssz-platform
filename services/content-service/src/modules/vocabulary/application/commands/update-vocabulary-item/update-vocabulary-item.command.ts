import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export class UpdateVocabularyItemCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
    public readonly itemId: string,
    public readonly word?: string,
    public readonly partOfSpeech?: PartOfSpeech | null,
    public readonly ipaTranscription?: string | null,
    public readonly pronunciationAudioMediaId?: string | null,
    public readonly grammaticalProperties?: Record<string, unknown> | null,
    public readonly register?: Register | null,
    public readonly notes?: string | null,
  ) {}
}
