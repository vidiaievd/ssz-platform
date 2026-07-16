import { ContainerVersionEntity } from './container-version.entity.js';
import { VersionStatus } from '../value-objects/version-status.vo.js';

function createDraftVersion() {
  return ContainerVersionEntity.create({
    containerId: 'container-1',
    versionNumber: 1,
    createdByUserId: 'owner-1',
  });
}

describe('ContainerVersionEntity — unpublish', () => {
  it('transitions a published version back to draft', () => {
    const version = createDraftVersion();
    version.publish('owner-1');

    const result = version.unpublish();

    expect(result.isOk).toBe(true);
    expect(version.status).toBe(VersionStatus.DRAFT);
  });

  it('fails to unpublish a version that is not published', () => {
    const version = createDraftVersion();

    const result = version.unpublish();

    expect(result.isFail).toBe(true);
  });
});
