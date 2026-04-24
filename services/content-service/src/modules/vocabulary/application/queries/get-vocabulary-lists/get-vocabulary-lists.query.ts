import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { VocabularyListQueryDto } from '../../../presentation/dto/requests/vocabulary-list-query.dto.js';

export class GetVocabularyListsQuery {
  constructor(
    public readonly dto: VocabularyListQueryDto,
    public readonly user: AuthenticatedUser,
  ) {}
}
