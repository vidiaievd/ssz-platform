import {
  mutatingRoutes,
  unguardedRoutes,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { GrammarRuleController } from './grammar-rule.controller.js';

describe('grammar rule write routes', () => {
  it('every mutating route declares an access requirement', () => {
    // `create` is exempt: there is no rule to authorize against yet.
    expect(unguardedRoutes(GrammarRuleController, ['create'])).toEqual([]);
  });

  it('finds the routes it claims to check', () => {
    expect(mutatingRoutes(GrammarRuleController)).toEqual(
      expect.arrayContaining(['createExplanation', 'publishExplanation']),
    );
  });
});
