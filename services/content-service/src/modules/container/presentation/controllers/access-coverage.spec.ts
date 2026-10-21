import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import {
  ACCESS_REQUIREMENT_KEY,
  type AccessRequirement,
} from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
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
  // Service-to-service call: no user to authorize, InternalAuthGuard checks the
  // x-internal-token instead (asserted below).
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

  /**
   * The one exempt write route. It was once @Public() and nothing else, so anyone
   * without a token could archive a version; the internal guard is what closes it.
   */
  it('gates archiving a version with the internal token', () => {
    const handler = Object.getOwnPropertyDescriptor(ContainerVersionController.prototype, 'archive')
      ?.value as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;

    expect(guards).toContain(InternalAuthGuard);
  });

  /**
   * A read route whose whole answer is "yes", which other services then act on. Demoted
   * to 'view' it would tell every enrolled learner they may mark their classmates' work,
   * and no test elsewhere would notice: the route would keep returning 200.
   */
  it('answers the edit-access question about editing, not viewing', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ContainerController.prototype,
      'checkEditAccess',
    )?.value as object;
    const requirement = Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, handler) as
      | AccessRequirement
      | undefined;

    expect(requirement).toEqual({
      action: 'edit',
      options: { entityType: TaggableEntityType.CONTAINER },
    });
  });
});
