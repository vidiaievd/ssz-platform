import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { GrammarRuleListQueryDto } from '../../../presentation/dto/requests/grammar-rule-list-query.dto.js';

export class GetGrammarRulesQuery {
  constructor(
    public readonly dto: GrammarRuleListQueryDto,
    public readonly user: AuthenticatedUser,
  ) {}
}
