import {
  isReferenceClip,
  REFERENCE_CLIP,
} from '../../../../src/modules/assets/domain/policies/reference-clip-policy.js';
import { SWEPT_CONTENT_TYPES } from '../../../../src/modules/assets/application/services/sweep-orphan-content-assets.service.js';
import {
  isContentEntityType,
  isPublicEntityType,
} from '../../../../src/shared/application/ports/storage.port.js';

describe('reference clips (plan 88, step 6b.3)', () => {
  it('are read like lesson media, from the private bucket', () => {
    expect(isContentEntityType(REFERENCE_CLIP)).toBe(true);
    expect(isPublicEntityType(REFERENCE_CLIP)).toBe(false);
  });

  it('are kept for good: the orphan content sweep does not list them', () => {
    expect(SWEPT_CONTENT_TYPES).not.toContain(REFERENCE_CLIP);
  });

  it('are told by their entity type', () => {
    expect(isReferenceClip('reference_clip')).toBe(true);
    expect(isReferenceClip('exercise_asset')).toBe(false);
    expect(isReferenceClip(null)).toBe(false);
  });
});
