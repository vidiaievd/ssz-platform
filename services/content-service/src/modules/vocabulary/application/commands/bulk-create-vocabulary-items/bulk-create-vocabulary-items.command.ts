import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

export interface BulkCreateItemDto {
  word: string;
  partOfSpeech?: PartOfSpeech;
  ipaTranscription?: string;
  pronunciationAudioMediaId?: string;
  grammaticalProperties?: Record<string, unknown>;
  register?: Register;
  notes?: string;
}

export class BulkCreateVocabularyItemsCommand {
  constructor(
    public readonly userId: string,
    public readonly listId: string,
    public readonly items: BulkCreateItemDto[],
  ) {}
}
