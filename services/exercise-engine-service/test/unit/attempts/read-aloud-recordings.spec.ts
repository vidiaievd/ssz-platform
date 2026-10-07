import {
  sampleDocument,
  SAMPLE_PROMPT_IDS,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/read-aloud';
import type { Submission } from '@ssz/shared-kernel/read-aloud';
import {
  assetIdsOf,
  checkAssets,
  checkPrompts,
} from '../../../src/modules/attempts/application/services/read-aloud-recordings.js';
import type { MediaAssetDescription } from '../../../src/shared/application/ports/media-assets.port.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;
const doc = sampleDocument();
const content = toContent(doc);
const key = toExpectedAnswers(doc);
const attempt = { id: 'attempt-1', userId: 'user-1' };

const asset = (id: string, ms: number, over: Partial<MediaAssetDescription> = {}): MediaAssetDescription => ({
  id,
  ownerId: 'user-1',
  entityType: 'submission_recording',
  entityId: 'attempt-1',
  status: 'READY',
  mimeType: 'audio/webm',
  sizeBytes: 1000,
  durationMs: ms,
  ...over,
});

const both = (a1 = 'a1', a2 = 'a2'): Submission => ({
  recordings: [
    { itemId: P1, assetId: a1, seconds: 20, takes: 1 },
    { itemId: P2, assetId: a2, seconds: 20, takes: 1 },
  ],
});

describe('checkPrompts', () => {
  it('passes one recording per prompt', () => {
    expect(checkPrompts(both(), content, key)).toBeNull();
  });

  it('names every prompt without a recording', () => {
    expect(checkPrompts({ recordings: [] }, content, key)).toMatchObject({
      code: 'RA_RECORDING_MISSING',
      itemIds: [P1, P2],
    });
  });

  it('refuses a prompt the exercise does not have, and a prompt answered twice', () => {
    const extra = { recordings: [...both().recordings, { itemId: 'zzz', assetId: 'a9', seconds: 20, takes: 1 }] };
    expect(checkPrompts(extra, content, key)).toMatchObject({
      code: 'RA_RECORDING_UNKNOWN_PROMPT',
      itemIds: ['zzz'],
    });
    const twice = { recordings: [...both().recordings, { itemId: P1, assetId: 'a9', seconds: 20, takes: 1 }] };
    expect(checkPrompts(twice, content, key)).toMatchObject({
      code: 'RA_RECORDING_UNKNOWN_PROMPT',
      itemIds: [P1],
    });
  });

  it('refuses one file handed in for two prompts', () => {
    expect(checkPrompts(both('a1', 'a1'), content, key)).toMatchObject({
      code: 'RA_RECORDING_DUPLICATE',
      itemIds: [P2],
    });
  });
});

describe('checkAssets (RA-U9)', () => {
  it('passes the student’s own finished recordings within range', () => {
    expect(checkAssets(both(), content, key, [asset('a1', 20_000), asset('a2', 40_000)], attempt)).toBeNull();
  });

  it('allows half a second either side of the range, and not a frame more', () => {
    // Prompts are 15–60 s.
    expect(checkAssets(both(), content, key, [asset('a1', 14_500), asset('a2', 60_500)], attempt)).toBeNull();
    expect(checkAssets(both(), content, key, [asset('a1', 14_499), asset('a2', 60_501)], attempt)).toMatchObject({
      code: 'RA_RECORDING_LENGTH',
      itemIds: [P1, P2],
    });
  });

  it('accepts a recording media-service has measured but not finished processing', () => {
    const assets = [asset('a1', 20_000, { status: 'UPLOADED' }), asset('a2', 20_000, { status: 'PROCESSING' })];
    expect(checkAssets(both(), content, key, assets, attempt)).toBeNull();
  });

  it('treats unknown, foreign, deleted and wrong-kind files alike', () => {
    const cases: MediaAssetDescription[][] = [
      [asset('a2', 20_000)],
      [asset('a1', 20_000, { ownerId: 'user-2' }), asset('a2', 20_000)],
      [asset('a1', 20_000, { entityId: 'other' }), asset('a2', 20_000)],
      [asset('a1', 20_000, { status: 'DELETED' }), asset('a2', 20_000)],
      [asset('a1', 20_000, { entityType: 'exercise_asset' }), asset('a2', 20_000)],
    ];
    for (const assets of cases) {
      expect(checkAssets(both(), content, key, assets, attempt)).toMatchObject({
        code: 'RA_RECORDING_NOT_FOUND',
        itemIds: [P1],
      });
    }
  });

  it('tells a refused upload from an unfinished one', () => {
    expect(
      checkAssets(both(), content, key, [asset('a1', 20_000, { status: 'FAILED' }), asset('a2', 20_000)], attempt),
    ).toMatchObject({ code: 'RA_RECORDING_FAILED', itemIds: [P1] });
    expect(
      checkAssets(
        both(),
        content,
        key,
        [asset('a1', 20_000), asset('a2', 0, { status: 'PENDING_UPLOAD', durationMs: null })],
        attempt,
      ),
    ).toMatchObject({ code: 'RA_RECORDING_NOT_READY', itemIds: [P2] });
  });

  it('checks a discarded take for ownership, never for length', () => {
    const sub: Submission = {
      recordings: [
        { itemId: P1, assetId: 'a1', seconds: 20, takes: 2, discarded: [{ assetId: 'a0', seconds: 2 }] },
        { itemId: P2, assetId: 'a2', seconds: 20, takes: 1 },
      ],
    };
    expect(assetIdsOf(sub)).toEqual(['a1', 'a0', 'a2']);
    expect(checkAssets(sub, content, key, [asset('a1', 20_000), asset('a0', 2_000), asset('a2', 20_000)], attempt)).toBeNull();
    expect(
      checkAssets(sub, content, key, [asset('a1', 20_000), asset('a0', 2_000, { ownerId: 'x' }), asset('a2', 20_000)], attempt),
    ).toMatchObject({ code: 'RA_RECORDING_NOT_FOUND', itemIds: [P1] });
  });
});
