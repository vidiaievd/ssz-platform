import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { AccessibleEntity } from '../../domain/types/accessible-entity.js';
import { VisibilityCheckerService } from '../../domain/services/visibility-checker.service.js';
import { EntityResolverRegistry } from '../../infrastructure/registry/entity-resolver-registry.js';
import { OrganizationServiceUnavailableException } from '../../infrastructure/clients/organization-service-unavailable.exception.js';
import {
  ACCESS_REQUIREMENT_KEY,
  type AccessRequirement,
} from '../decorators/require-access.decorator.js';
import { AccessDeniedException } from '../exceptions/access-denied.exception.js';
import { urlSlugToEntityType } from '../utils/url-slug-to-entity-type.js';

// VisibilityGuard runs AFTER JwtAuthGuard — @UseGuards(JwtAuthGuard, VisibilityGuard).
// JwtAuthGuard attaches request.user; this guard reads it.
@Injectable()
export class VisibilityGuard implements CanActivate {
  private readonly logger = new Logger(VisibilityGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly checker: VisibilityCheckerService,
    private readonly registry: EntityResolverRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<AccessRequirement | undefined>(
      ACCESS_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser; accessEntity: AccessibleEntity }>();

    const { action, options } = requirement;

    // Resolve entity type — either fixed or dynamic from URL param.
    let entityType: ReturnType<typeof urlSlugToEntityType>;
    if ('entityType' in options) {
      entityType = options.entityType;
    } else {
      const slug = request.params[options.entityTypeParam] as string;
      entityType = urlSlugToEntityType(slug);
      if (entityType === null) {
        this.logger.warn(`Unknown entityType slug in URL: '${slug}'`);
        throw new NotFoundException(`Unknown entity type: '${slug}'`);
      }
    }

    // Resolve entity id from params.
    const idParam = 'idParam' in options && options.idParam ? options.idParam : 'id';
    const entityId = request.params[idParam] as string;

    if (!entityId) {
      throw new NotFoundException('Entity id not found in request params');
    }

    // Load entity (including soft-deleted — guard algorithm needs it).
    let entity: AccessibleEntity | null;
    try {
      entity = await this.registry.resolve(entityType, entityId);
    } catch (err) {
      this.logger.error(`EntityResolver threw for ${entityType}/${entityId}: ${String(err)}`);
      throw err;
    }

    if (!entity) throw new NotFoundException();

    // Run access algorithm.
    let decision: Awaited<ReturnType<VisibilityCheckerService['canAccess']>>;
    try {
      decision = await this.checker.canAccess(request.user, entity, action);
    } catch (err) {
      if (err instanceof OrganizationServiceUnavailableException) {
        this.logger.error(`Organization Service unavailable: ${err.message}`);
        throw new ServiceUnavailableException('Organization Service is temporarily unavailable');
      }
      throw err;
    }

    if (!decision.allowed) {
      this.logger.debug(
        `Access denied — userId=${request.user.userId} entity=${entityType}/${entityId} action=${action} reason=${decision.reason ?? 'unknown'}`,
      );
      throw new AccessDeniedException(decision.reason);
    }

    // Attach entity to request so handlers can consume it via @AccessEntity().
    request.accessEntity = entity;
    return true;
  }
}
