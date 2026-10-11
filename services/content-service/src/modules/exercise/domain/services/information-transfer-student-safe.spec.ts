import {
  sampleContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/information-transfer';
import { studentSafeContent } from './student-safe-content.js';

// Plan 73 §3.2, INF-B30. A structural test: no string of the key, the explanations, the grading
// rules or the pass mark appears anywhere in the payload.

describe('information_transfer student projection', () => {
  const project = (kind: 'audio' | 'text' = 'audio', patch?: (c: Record<string, any>) => void) => {
    const doc = sampleContent(kind);
    const content = toContent(doc) as unknown as Record<string, any>;
    patch?.(content);
    const key = toExpectedAnswers(doc) as unknown as Record<string, unknown>;
    return { doc, p: studentSafeContent('information_transfer', content, key) };
  };

  it('never ships an expected wording, an explanation, a grading rule or the pass mark', () => {
    const { doc, p } = project();
    expect(p['grading']).toBeUndefined();
    expect(p['scoring']).toBeUndefined();
    expect(p['focus']).toBeUndefined();
    const json = JSON.stringify(p);
    for (const f of doc.fields) {
      for (const e of f.expected) expect(json).not.toContain(e);
      expect(json).not.toContain(f.why);
    }
  });

  it('holds the transcript back while the layer’s policy says «after»', () => {
    const { doc, p } = project('audio');
    expect(JSON.stringify(p)).not.toContain(doc.audio.transcript);
  });

  it('carries the passage for a text source and not for a recording', () => {
    expect(project('text').p['passage']).toEqual(expect.any(String));
    expect(project('audio').p['passage']).toBeUndefined();
  });

  it('drops a field that is not finished', () => {
    const { p } = project('audio', (c) => {
      c['fields'].push({
        id: 'draft1',
        label: 'Etasje',
        type: 'number',
        unit: '',
        hint: '',
        required: true,
      });
    });
    const ids = (p['fields'] as { id: string }[]).map((f) => f.id);
    expect(ids).not.toContain('draft1');
    expect(ids).toHaveLength(6);
  });

  it('prints a hint only when the blank is set to print it from the start', () => {
    const hinted = (p: Record<string, unknown>) =>
      (p['fields'] as { hint?: string }[]).some((f) => f.hint !== undefined);
    expect(hinted(project('audio', (c) => (c['answering'].hintsAfter = 1)).p)).toBe(false);
    expect(hinted(project('audio', (c) => (c['answering'].hintsAfter = 0)).p)).toBe(true);
  });
});
