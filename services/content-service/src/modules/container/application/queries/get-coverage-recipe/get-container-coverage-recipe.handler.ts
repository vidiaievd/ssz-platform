import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetContainerCoverageRecipeQuery } from './get-container-coverage-recipe.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  CoverageRecipeResolver,
  type ResolvedCoverageRecipe,
} from '../../services/coverage-recipe-resolver.service.js';

export type ContainerCoverageRecipeResult = ResolvedCoverageRecipe;

/**
 * The course's recipe and the one behind it, side by side — the shape of the response
 * promise (plan 44, criterion 35) and for the same reason: an author deciding whether to
 * depart from the workspace needs to see what they would depart from.
 */
@QueryHandler(GetContainerCoverageRecipeQuery)
export class GetContainerCoverageRecipeHandler implements IQueryHandler<GetContainerCoverageRecipeQuery> {
  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    private readonly resolver: CoverageRecipeResolver,
  ) {}

  async execute(
    query: GetContainerCoverageRecipeQuery,
  ): Promise<Result<ContainerCoverageRecipeResult, ContainerDomainError>> {
    const container = await this.containers.findById(query.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    return Result.ok(await this.resolver.resolve(container));
  }
}
