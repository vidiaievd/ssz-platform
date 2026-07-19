import { jest } from '@jest/globals';
import { CountEnrollmentsByContainerHandler } from '../../../../../src/modules/enrollments/application/queries/count-enrollments-by-container.handler.js';
import { CountEnrollmentsByContainerQuery } from '../../../../../src/modules/enrollments/application/queries/count-enrollments-by-container.query.js';
import type { IEnrollmentRepository } from '../../../../../src/modules/enrollments/domain/repositories/enrollment.repository.interface.js';

const CONTAINER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('CountEnrollmentsByContainerHandler', () => {
  it('returns the active enrollment count from the repository', async () => {
    const repo = {
      countActiveByContainerId: jest.fn<() => Promise<number>>().mockResolvedValue(7),
    } as unknown as IEnrollmentRepository;
    const handler = new CountEnrollmentsByContainerHandler(repo);

    const result = await handler.execute(new CountEnrollmentsByContainerQuery(CONTAINER_ID));

    expect(result).toBe(7);
    expect(repo.countActiveByContainerId).toHaveBeenCalledWith(CONTAINER_ID);
  });

  it('returns 0 when no active enrollments exist', async () => {
    const repo = {
      countActiveByContainerId: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as IEnrollmentRepository;
    const handler = new CountEnrollmentsByContainerHandler(repo);

    const result = await handler.execute(new CountEnrollmentsByContainerQuery(CONTAINER_ID));

    expect(result).toBe(0);
  });
});
