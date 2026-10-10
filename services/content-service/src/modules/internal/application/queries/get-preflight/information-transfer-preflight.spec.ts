import {
  sampleContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/information-transfer';
import { informationTransferViolations } from './information-transfer-preflight.js';

const run = (doc = sampleContent(), patch?: (c: any, k: any) => void) => {
  const content = toContent(doc) as any;
  const expectedAnswers = toExpectedAnswers(doc) as any;
  patch?.(content, expectedAnswers);
  return informationTransferViolations({ id: 'ex1', content, expectedAnswers });
};

describe('information_transfer preflight (plan 73 phase 3)', () => {
  it('lets the finished sample through with no blocker', () => {
    expect(run().filter((v) => v.severity === 'blocker')).toEqual([]);
  });

  it('prefixes the kernel’s code and drops info', () => {
    const out = run(sampleContent(), (c) => {
      c.scoring.memory = 'none';
    });
    expect(out.every((v) => v.ruleCode.startsWith('INFORMATIONTRANSFER_INF_'))).toBe(true);
    expect(out.find((v) => v.ruleCode.endsWith('NO_MEMORY'))).toBeUndefined();
  });

  it('blocks a field with no key, once per code', () => {
    const out = run(sampleContent(), (_c, k) => {
      for (const id of Object.keys(k.fields).slice(0, 2)) k.fields[id].expected = [];
    });
    const hit = out.filter((v) => v.ruleCode === 'INFORMATIONTRANSFER_INF_FIELD_NO_KEY');
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('blocker');
    expect(hit[0].detail).toContain('2 fields');
  });

  it('blocks a recording with no transcript and a blank with no fields', () => {
    const out = run(sampleContent(), (c) => {
      c.audio.transcript = '';
      c.fields = [];
    });
    const codes = out.map((v) => v.ruleCode);
    expect(codes).toContain('INFORMATIONTRANSFER_INF_NO_FIELDS');
  });
});
