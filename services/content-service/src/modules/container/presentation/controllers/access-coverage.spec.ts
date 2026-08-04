import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';

import { ACCESS_REQUIREMENT_KEY } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { ContainerController } from './container.controller.js';
import { ContainerItemController } from './container-item.controller.js';
import { ContainerSectionController } from './container-section.controller.js';
import { ContainerVersionController } from './container-version.controller.js';

/**
 * Authorization for container writes lives in `VisibilityGuard` — the command
 * handlers no longer re-check `ownerUserId`, because that duplicate was
 * strictly weaker than the guard's rule and got school admins and co-authors
 * wrong. The cost of that decision is this test: a mutating route added
 * without `@RequireAccess` would be wide open, and nothing else would notice.
 */

const MUTATING = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE];

/** Routes that deliberately carry no entity-level requirement. */
const EXEMPT = new Set([
  // Creating a container: there is no entity to authorize against yet.
  'ContainerController.create',
  // Service-to-service call, @Public() with its own TODO to gate it with
  // InternalAuthGuard. Not reachable with a user token.
  'ContainerVersionController.archive',
]);

type Ctor = new (...args: never[]) => object;

function mutatingRoutes(controller: Ctor): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .filter((name) => {
      const handler = proto[name];
      if (typeof handler !== 'function') return false;
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) return false;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      return MUTATING.includes(method);
    });
}

describe('container write routes', () => {
  const controllers: Array<[string, Ctor]> = [
    ['ContainerController', ContainerController],
    ['ContainerItemController', ContainerItemController],
    ['ContainerSectionController', ContainerSectionController],
    ['ContainerVersionController', ContainerVersionController],
  ];

  it.each(controllers)(
    'every mutating route of %s declares an access requirement',
    (name, controller) => {
      const proto = controller.prototype as Record<string, unknown>;
      const unguarded = mutatingRoutes(controller).filter((route) => {
        if (EXEMPT.has(`${name}.${route}`)) return false;
        return Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, proto[route] as object) === undefined;
      });

      expect(unguarded).toEqual([]);
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
