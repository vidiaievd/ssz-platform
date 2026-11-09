import { alignLetters, type LetterSeg } from './align-letters.js';

// Plan 86, step 6d: the letters of a word laid over its lexicon sounds. Transcriptions are NB
// Uttale østnorsk rows (04.11); the words are the teacher's and the dev lessons'.

/** `tu·V(OH2) ng·C(NG)~`: letters, kind, sounds with the stress, and `~` where letters tie. */
const show = (word: string, nofabet: string): string | null => {
  const segs = alignLetters(word, nofabet);
  return (
    segs &&
    segs
      .map((x: LetterSeg) => {
        const letters = word.slice(x.s, x.e) || '∅';
        if (x.kind === 'silent') return `(${letters})`;
        const sounds = x.sounds.join('.') + (x.stress !== null ? String(x.stress) : '');
        return `${letters}=${sounds}${x.tie ? '~' : ''}`;
      })
      .join(' ')
  );
};

describe('alignLetters', () => {
  it('reads letters as their sounds and keeps the stress digit on the vowel', () => {
    expect(show('tre', 'T R EE1')).toBe('t=T r=R e=EE1');
    expect(show('hus', 'H UU1 S')).toBe('h=H u=UU1 s=S');
  });

  it('ties letters read as one sound and marks the silent ones', () => {
    expect(show('tunge', 'T OH2 NG AX0')).toBe('t=T u=OH2 ng=NG~ e=AX0');
    expect(show('gjerne', 'J AE1 RN AX0')).toBe('(g) j=J e=AE1 rn=RN~ e=AX0');
    expect(show('godt', 'G OH1 T')).toBe('g=G o=OH1 (d) t=T');
    expect(show('hva', 'V AA1')).toBe('(h) v=V a=AA1');
    expect(show('kveld', 'K V EH1 L')).toBe('k=K v=V e=EH1 l=L (d)');
  });

  it('reads sj, skj and kj as single sounds', () => {
    expect(show('skjorte', 'SJ OA1 RT AX0')).toBe('skj=SJ~ o=OA1 rt=RT~ e=AX0');
    expect(show('kjøkken', 'KJ OE1 K N')).toBe('kj=KJ~ ø=OE1 kk=K (e) n=N');
  });

  it('reads a diphthong as one vowel, written with one letter or two', () => {
    expect(show('reise', 'R AEJ2 S AX0')).toBe('r=R ei=AEJ2 s=S e=AX0');
    expect(show('seg', 'S AEJ1')).toBe('s=S eg=AEJ1~');
  });

  it('splits the e of a syllabic consonant from its n, l or rn', () => {
    expect(show('hesten', 'H EH1 S T NX0')).toBe('h=H e=EH1 s=S t=T (e) n=NX0');
    expect(show('fjorden', 'F J OO3 RNX0')).toBe('f=F j=J o=OO3 (r) (d) (e) n=RNX0');
  });

  it('lays a retroflex on the plain letters after its r — across the join of a word', () => {
    expect(show('læreren', 'L AE1 R AX0 RN')).toBe('l=L æ=AE1 r=R e=AX0 ren=RN~');
    expect(show('bokholderens', 'B OO2 K H OAH3 L AX0 RN RS')).toBe(
      'b=B o=OO2 k=K h=H o=OAH3 l=L (d) e=AX0 ren=RN~ s=RS',
    );
    expect(show('sikkerhetsregimet', 'S IH1 K AX0 R H EE0 T S R AX0 SJ II3 M AX0')).toBe(
      's=S i=IH1 kk=K e=AX0 r=R h=H e=EE0 t=T s=S r=R e=AX0 g=SJ i=II3 m=M e=AX0 (t)',
    );
  });

  it('covers the whole word with no gap and no overlap', () => {
    for (const [word, nofabet] of [
      ['stillingsannonser', 'S T IH2 L IH0 NG S AH0 N OAH3 NG S AX0 R'],
      ['bokholderens', 'B OO2 K H OAH3 L AX0 RN RS'],
      ['hesten', 'H EH1 S T NX0'],
    ] as const) {
      const segs = alignLetters(word, nofabet)!;
      let at = 0;
      for (const seg of segs) {
        expect(seg.s).toBe(at);
        at = seg.e;
      }
      expect(at).toBe(word.length);
    }
  });

  it('marks a long vowel and a diphthong long, a short one not', () => {
    const long = (word: string, nofabet: string) => alignLetters(word, nofabet)!.find((x) => x.kind === 'vowel')!.long;
    expect(long('tre', 'T R EE1')).toBe(true);
    expect(long('hus', 'H UU1 S')).toBe(true);
    expect(long('godt', 'G OH1 T')).toBe(false);
    expect(long('reise', 'R AEJ2 S AX0')).toBe(true);
  });

  it('writes a schwa the spelling does not write as a segment of no letters', () => {
    const segs = alignLetters('anm', 'AH0 N AX0 M')!;
    expect(segs.some((x) => x.s === x.e && x.sounds[0] === 'AX')).toBe(true);
  });

  it('gives up on a word it cannot lay without a guess', () => {
    // A vowel letter that would have to be silent is a failure to read the word, not a reading.
    expect(alignLetters('fire', 'F II1 R')).toBeNull();
    expect(alignLetters('hei', 'K')).toBeNull();
    expect(alignLetters('community', 'K OAH0 M J UU1 N IH0 T IH0')).toBeNull();
  });

  it('refuses a word with a letter outside the alphabet, a word break and an unknown sound', () => {
    expect(alignLetters('e-post', 'EE1 P OAH2 S T')).toBeNull();
    expect(alignLetters('usa', 'UU1 _ EH0 S AA1')).toBeNull();
    expect(alignLetters('hus', 'H ZZ1 S')).toBeNull();
    expect(alignLetters('', '')).toBeNull();
  });
});
