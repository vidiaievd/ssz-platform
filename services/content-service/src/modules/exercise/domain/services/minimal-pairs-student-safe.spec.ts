import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/minimal-pairs';
import { studentSafeContent } from './student-safe-content.js';

// Plan 72 §3.2, MP-B30. In this type the *content* is the key — which clip is which word — so the
// projection is built by saying what may leave, not by cutting out what may not. A structural test:
// no string of the document that names a word, a clip or a note appears anywhere in the payload.

describe('minimal_pairs student projection', () => {
  const doc = sampleDocument();
  const content = toContent(doc) as unknown as Record<string, unknown>;
  const key = toExpectedAnswers(doc) as unknown as Record<string, unknown>;
  const project = (c = content, k = key) =>
    studentSafeContent('minimal_pairs', c, k) as unknown as Record<string, unknown>;

  it('ships what the runner draws before the first probe, and nothing else', () => {
    const p = project();
    expect(Object.keys(p).sort()).toEqual([
      'contrast',
      'feedback',
      'instruction',
      'language',
      'set',
      'title',
    ]);
    expect(Object.keys(p['set'] as object).sort()).toEqual(['autoplay', 'playsPerProbe', 'probes']);
    expect(p['contrast']).toEqual({ label: expect.any(String), ipa: expect.any(String) });
  });

  it('never ships a pair, a word, a clip, an asset id, a pass mark or a note', () => {
    const p = project();
    expect(p['pairs']).toBeUndefined();
    expect(p['scoring']).toBeUndefined();
    const json = JSON.stringify(p);
    for (const pair of doc.pairs) {
      expect(json).not.toContain(pair.id);
      if (pair.note !== '') expect(json).not.toContain(pair.note);
      for (const w of pair.words) {
        expect(json).not.toContain(w.id);
        for (const secret of [
          w.text,
          w.gloss,
          w.ipa,
          w.clip.assetId,
          w.clip.fileName,
          w.clip.voice,
        ]) {
          if (secret !== '') expect(json).not.toContain(secret);
        }
      }
    }
    expect(json).not.toContain('passPct');
    expect(json).not.toContain('assetId');
  });

  it('does not depend on the key column — the note is never read', () => {
    expect(project(content, {})).toEqual(project());
  });

  it('survives a document that is not the shape at all', () => {
    expect(() => project({ nonsense: true })).not.toThrow();
  });
});
