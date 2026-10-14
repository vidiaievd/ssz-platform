import { assignSpeakerVoices } from '../../../../src/modules/narration/domain/speaker-voices.js';

const voices = [
  { id: 'talesyntese', gender: 'male' as const },
  { id: 'nvcc-kon', gender: 'female' as const },
  { id: 'nvcc-kmn', gender: 'female' as const },
  { id: 'nvcc-mmn', gender: 'male' as const },
  { id: 'nvcc-mnn', gender: 'male' as const },
];

describe('assignSpeakerVoices', () => {
  it('gives each speaker a voice of their own, never the narrator, male and female in turn', () => {
    expect(assignSpeakerVoices(['Erik', 'Taras', 'Silje'], 'talesyntese', voices, null)).toEqual({
      Erik: 'nvcc-mmn',
      Taras: 'nvcc-kon',
      Silje: 'nvcc-mnn',
    });
  });

  it("keeps the author's choice and fits everyone else around it", () => {
    expect(
      assignSpeakerVoices(['Erik', 'Taras'], 'talesyntese', voices, { Taras: 'nvcc-mmn' }),
    ).toEqual({ Taras: 'nvcc-mmn', Erik: 'nvcc-mnn' });
  });

  it('drops a choice that names no voice of the language', () => {
    expect(assignSpeakerVoices(['Erik'], 'talesyntese', voices, { Erik: 'gone' })).toEqual({
      Erik: 'nvcc-mmn',
    });
  });

  it('reuses voices once every one is taken', () => {
    const map = assignSpeakerVoices(['A', 'B', 'C', 'D', 'E', 'F'], 'talesyntese', voices, null);
    expect(Object.keys(map)).toHaveLength(6);
    expect(Object.values(map)).not.toContain('talesyntese');
  });

  it('leaves everyone with the narrator when there is no other voice', () => {
    expect(assignSpeakerVoices(['Erik'], 'talesyntese', [voices[0]!], null)).toEqual({});
  });
});
