import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export class CreateVocabularyItemCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
    public readonly word: string,
    public readonly partOfSpeech?: PartOfSpeech,
    public readonly ipaTranscription?: string,
    public readonly pronunciationAudioMediaId?: string,
    public readonly grammaticalProperties?: Record<string, unknown>,
    public readonly register?: Register,
    public readonly notes?: string,
    public readonly position?: number,
  ) {}
}
