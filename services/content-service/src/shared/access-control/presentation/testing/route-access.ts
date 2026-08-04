import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';

import { ACCESS_REQUIREMENT_KEY } from '../decorators/require-access.decorator.js';

/**
 * Reflection helpers for the access-coverage specs.
 *
 * Authorization for content writes lives in `VisibilityGuard`; the command
 * handlers do not re-check ownership, because that duplicate was strictly
 * weaker than the guard's rule and got school admins and co-authors wrong.
 * The cost is that a mutating route added without `@RequireAccess` would be
 * wide open, and nothing else in the codebase would notice — hence these.
 */

const MUTATING = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE];

export type ControllerClass = new (...args: never[]) => object;

/** Names of the controller methods bound to a POST/PUT/PATCH/DELETE route. */
export function mutatingRoutes(controller: ControllerClass): string[] {
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

/**
 * Mutating routes of `controller` that declare no access requirement, minus
 * `exempt` (method names the caller has deliberately excused).
 */
export function unguardedRoutes(controller: ControllerClass, exempt: string[] = []): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return mutatingRoutes(controller)
    .filter((route) => !exempt.includes(route))
    .filter(
      (route) => Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, proto[route] as object) === undefined,
    );
}
