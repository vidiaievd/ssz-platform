import { jest } from '@jest/globals';
import { SetContainerMaintenanceStatusHandler } from './set-container-maintenance-status.handler.js';
import { SetContainerMaintenanceStatusCommand } from './set-container-maintenance-status.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import {
  MaintenanceSource,
  MaintenanceStatus,
} from '../../../domain/value-objects/maintenance-status.vo.js';

function course(): ContainerEntity {
  const created = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: 'Ny i Norge — A2',
    ownerUserId: 'author-1',
    visibility: Visibility.PUBLIC,
    accessTier: AccessTier.PUBLIC_FREE,
  });
  if (created.isFail) throw new Error(String(created.error));
  created.value.clearDomainEvents();
  return created.value;
}

function makeHandler(container: ContainerEntity | null) {
  const containers = {
    findById: jest.fn(() => Promise.resolve(container)),
    save: jest.fn((c: ContainerEntity) => Promise.resolve(c)),
  };
  const auditLog = { record: jest.fn(() => Promise.resolve()) };
  return {
    handler: new SetContainerMaintenanceStatusHandler(containers as never, auditLog as never),
    containers,
    auditLog,
  };
}

describe('SetContainerMaintenanceStatusHandler', () => {
  it('saves the new status, records it and answers the course', async () => {
    const { handler, containers, auditLog } = makeHandler(course());

    const result = await handler.execute(
      new SetContainerMaintenanceStatusCommand('author-1', 'c-1', MaintenanceStatus.OBSOLETE),
    );

    expect(result.isOk).toBe(true);
    if (!result.isOk) return;
    expect(result.value.maintenanceStatus).toBe(MaintenanceStatus.OBSOLETE);
    expect(result.value.maintenanceSource).toBe(MaintenanceSource.AUTHOR);
    expect(containers.save).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTAINER',
        entityId: 'c-1',
        actorUserId: 'author-1',
        changedFields: ['maintenanceStatus'],
      }),
    );
  });

  it('writes nothing when the course already stands there', async () => {
    const { handler, containers, auditLog } = makeHandler(course());

    const result = await handler.execute(
      new SetContainerMaintenanceStatusCommand('author-1', 'c-1', MaintenanceStatus.MAINTAINED),
    );

    expect(result.isOk).toBe(true);
    expect(containers.save).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('answers CONTAINER_NOT_FOUND for an unknown course', async () => {
    const { handler, containers } = makeHandler(null);

    const result = await handler.execute(
      new SetContainerMaintenanceStatusCommand('author-1', 'nope', MaintenanceStatus.OBSOLETE),
    );

    expect(result.isFail && result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
    expect(containers.save).not.toHaveBeenCalled();
  });

  it('passes the domain refusal through without saving', async () => {
    const deleted = course();
    deleted.softDelete();
    const { handler, containers } = makeHandler(deleted);

    const result = await handler.execute(
      new SetContainerMaintenanceStatusCommand('author-1', 'c-1', MaintenanceStatus.OBSOLETE),
    );

    expect(result.isFail && result.error).toBe(ContainerDomainError.CONTAINER_ALREADY_DELETED);
    expect(containers.save).not.toHaveBeenCalled();
  });
});
