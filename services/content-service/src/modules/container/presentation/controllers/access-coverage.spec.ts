import {
  mutatingRoutes,
  unguardedRoutes,
  type ControllerClass,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { ContainerController } from './container.controller.js';
import { ContainerItemController } from './container-item.controller.js';
import { ContainerSectionController } from './container-section.controller.js';
import { ContainerVersionController } from './container-version.controller.js';

/** Method names that deliberately carry no entity-level requirement. */
const EXEMPT: Record<string, string[]> = {
  // Creating a container: there is no entity to authorize against yet.
  ContainerController: ['create'],
  // Service-to-service call, @Public() with its own TODO to gate it with
  // InternalAuthGuard. Not reachable with a user token.
  ContainerVersionController: ['archive'],
};

const CONTROLLERS: Array<[string, ControllerClass]> = [
  ['ContainerController', ContainerController],
  ['ContainerItemController', ContainerItemController],
  ['ContainerSectionController', ContainerSectionController],
  ['ContainerVersionController', ContainerVersionController],
];

describe('container write routes', () => {
  it.each(CONTROLLERS)(
    'every mutating route of %s declares an access requirement',
    (name, controller) => {
      expect(unguardedRoutes(controller, EXEMPT[name])).toEqual([]);
    },
  );

  it('finds the routes it claims to check', () => {
    // Guards against the reflection above silently matching nothing, which
    // would make every assertion here pass on an empty list.
    expect(mutatingRoutes(ContainerVersionController)).toEqual(
      expect.arrayContaining(['publish', 'cancelDraft']),
    );
  });
});
