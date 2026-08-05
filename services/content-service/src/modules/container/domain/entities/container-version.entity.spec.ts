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
  it('deprecates a published version rather than handing back a second draft', () => {
    const version = createDraftVersion();
    version.publish('owner-1');

    const result = version.unpublish();

    expect(result.isOk).toBe(true);
    expect(version.status).toBe(VersionStatus.DEPRECATED);
    expect(version.deprecatedAt).not.toBeNull();
    // Nothing superseded it, so it must not sunset out of reach of a rollback.
    expect(version.sunsetAt).toBeNull();
  });

  it('fails to unpublish a version that is not published', () => {
    const version = createDraftVersion();

    const result = version.unpublish();

    expect(result.isFail).toBe(true);
  });
});
