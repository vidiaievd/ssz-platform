import { jest } from '@jest/globals';
import { GetContainersHandler } from './get-containers.handler.js';
import { GetContainersQuery } from './get-containers.query.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import type {
  ContainerCatalogCriteria,
  IContainerCatalogReader,
} from '../../../domain/repositories/container-catalog.reader.interface.js';
import type { ContainerListQueryDto } from '../../../presentation/dto/requests/container-list-query.dto.js';
import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

const USER = { userId: 'user-1' } as AuthenticatedUser;

function makeHandler() {
  const findPage = jest.fn<IContainerCatalogReader['findPage']>().mockResolvedValue({
    items: [],
    total: 0,
  });
  const handler = new GetContainersHandler({ findPage }, new PaginationService(), new SortParserService());
  const criteria = (): ContainerCatalogCriteria => findPage.mock.calls[0]![0];
  return { handler, findPage, criteria };
}

const run = (handler: GetContainersHandler, dto: Partial<ContainerListQueryDto> = {}) =>
  handler.execute(new GetContainersQuery(dto as ContainerListQueryDto, USER));

describe('GetContainersHandler', () => {
  it('hides obsolete and archived courses by default', async () => {
    const { handler, criteria } = makeHandler();

    await run(handler);

    expect(criteria().includeHidden).toBe(false);
    expect(criteria().userId).toBe('user-1');
  });

  it('lists them when asked with includeObsolete', async () => {
    const { handler, criteria } = makeHandler();

    await run(handler, { includeObsolete: true });

    expect(criteria().includeHidden).toBe(true);
  });

  it('hands filters, paging and sort to the reader', async () => {
    const { handler, criteria } = makeHandler();

    await run(handler, { targetLanguage: 'nb', search: 'norsk', page: 3, limit: 10, sort: 'title_asc' });

    expect(criteria()).toMatchObject({
      filters: { targetLanguage: 'nb', search: 'norsk' },
      skip: 20,
      take: 10,
      sort: [{ field: 'title', direction: 'asc' }],
    });
  });

  it('wraps the reader page into a paginated result', async () => {
    const { handler, findPage } = makeHandler();
    findPage.mockResolvedValue({ items: [], total: 25 });

    const result = await run(handler, { page: 2, limit: 10 });

    expect(result).toMatchObject({ total: 25, page: 2, limit: 10, totalPages: 3 });
  });
});
