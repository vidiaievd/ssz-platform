import {
  mutatingRoutes,
  unguardedRoutes,
  type ControllerClass,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { VocabularyExampleController } from './vocabulary-example.controller.js';
import { VocabularyItemController } from './vocabulary-item.controller.js';
import { VocabularyListController } from './vocabulary-list.controller.js';

/** Method names that deliberately carry no entity-level requirement. */
const EXEMPT: Record<string, string[]> = {
  // Creating a list: there is no list to authorize against yet.
  VocabularyListController: ['create'],
};

const CONTROLLERS: Array<[string, ControllerClass]> = [
  ['VocabularyExampleController', VocabularyExampleController],
  ['VocabularyItemController', VocabularyItemController],
  ['VocabularyListController', VocabularyListController],
];

describe('vocabulary write routes', () => {
  it.each(CONTROLLERS)(
    'every mutating route of %s declares an access requirement',
    (name, controller) => {
      expect(unguardedRoutes(controller, EXEMPT[name])).toEqual([]);
    },
  );

  it('finds the routes it claims to check', () => {
    expect(mutatingRoutes(VocabularyItemController)).toEqual(
      expect.arrayContaining(['create', 'update', 'remove']),
    );
  });
});
