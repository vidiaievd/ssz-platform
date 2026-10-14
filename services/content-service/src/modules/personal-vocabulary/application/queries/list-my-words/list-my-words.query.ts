export type PersonalWordStatus = 'pending' | 'resolved';

export class ListMyWordsQuery {
  constructor(
    public readonly userId: string,
    public readonly translationLanguage: string,
    public readonly targetLanguage?: string,
    public readonly status?: PersonalWordStatus,
  ) {}
}
