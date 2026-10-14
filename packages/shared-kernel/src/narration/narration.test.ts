import { describe, expect, it } from 'vitest';

import {
  narrationSpeakers,
  NARRATION_PARAGRAPH_PAUSE_MS,
  NARRATION_TURN_PAUSE_MS,
  narrationPauseMs,
  toNarrationScript,
  type NarrationSegment,
} from './script.js';
import { sha256Hex } from './sha256.js';

const texts = (body: string) => toNarrationScript(body, 'nb').segments.map((s) => s.text);

describe('sha256Hex', () => {
  // Reference digests from Node's `crypto.createHash('sha256')`.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'Blåbærsyltetøy på brødskiva — «hei» 👍',
      '549be9159d7d834f074161334fc5f3111c090c2b1acae91a6a9e82e19f0fe8be',
    ],
    // 55 bytes is the longest message that pads into one block; 64 forces a second.
    ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
  ])('hashes %j', (input, digest) => {
    expect(sha256Hex(input)).toBe(digest);
  });
});

describe('toNarrationScript — dialogue (norsk_it 2D)', () => {
  const body = [
    '## 2D — Prøvetiden og den første tilbakemeldingen',
    '',
    'Etter tre uker har Taras et oppfølgingsmøte med Silje. I Norge er det vanlig',
    'med seks måneders prøvetid.',
    '',
    '**Silje:** Hvordan synes du de første ukene har vært?',
    '',
    '**Taras:** Jeg har lært mye, og jeg har fått god hjelp fra Ingrid og',
    'Mohammed.',
    '',
    '**Silje (etterpå):** Perfekt. Fortsett sånn.',
  ].join('\n');

  it('reads the heading without the sub-lesson code', () => {
    expect(toNarrationScript(body, 'nb').segments[0]).toEqual({
      kind: 'heading',
      speaker: null,
      text: 'Prøvetiden og den første tilbakemeldingen',
    });
  });

  it('joins wrapped lines and keeps narration as a paragraph', () => {
    expect(toNarrationScript(body, 'nb').segments[1]).toEqual({
      kind: 'paragraph',
      speaker: null,
      text: 'Etter tre uker har Taras et oppfølgingsmøte med Silje. I Norge er det vanlig med seks måneders prøvetid.',
    });
  });

  it('turns speaker labels into turns and never reads the name', () => {
    const turns = toNarrationScript(body, 'nb').segments.filter((s) => s.kind === 'turn');
    expect(turns).toEqual([
      { kind: 'turn', speaker: 'Silje', text: 'Hvordan synes du de første ukene har vært?' },
      {
        kind: 'turn',
        speaker: 'Taras',
        text: 'Jeg har lært mye, og jeg har fått god hjelp fra Ingrid og Mohammed.',
      },
      { kind: 'turn', speaker: 'Silje', text: 'Perfekt. Fortsett sånn.' },
    ]);
  });

  it('accepts a long stage direction after the name', () => {
    const [turn] = toNarrationScript(
      '**Kristian (i en kort tale før middagen):** Takk for et godt år!',
      'nb',
    ).segments;
    expect(turn).toEqual({ kind: 'turn', speaker: 'Kristian', text: 'Takk for et godt år!' });
  });

  it('opens a new turn on each label even without a blank line', () => {
    const segments = toNarrationScript('**Ola:** Hei!\n**Maja:** Hei, Ola.', 'nb').segments;
    expect(segments.map((s) => [s.speaker, s.text])).toEqual([
      ['Ola', 'Hei!'],
      ['Maja', 'Hei, Ola.'],
    ]);
  });

  it('reads dash-introduced lines as turns without a speaker', () => {
    const segments = toNarrationScript('– Hei!\n— Hei, hvordan går det?', 'nb').segments;
    expect(segments).toEqual([
      { kind: 'turn', speaker: null, text: 'Hei!' },
      { kind: 'turn', speaker: null, text: 'Hei, hvordan går det?' },
    ]);
  });

  it('does not take a bold sentence for a speaker', () => {
    expect(texts('**Dette er viktig. Les nøye:** fristen er fredag.')).toEqual([
      'Dette er viktig. Les nøye: fristen er fredag.',
    ]);
  });
});

describe('toNarrationScript — block quotes as documents', () => {
  it('reads the labels of a quoted document (norsk_it 1A)', () => {
    const body = [
      '> **Backend-utvikler søkes til Nordly Tech AS**',
      '>',
      '> **Vi ønsker at du:**',
      '> - har erfaring med C# og .NET (eller tilsvarende',
      '>   bakgrunn fra Java)',
      '> - kan grunnleggende SQL',
      '>',
      '> **Profil:** Backend-utvikler med fem års erfaring.',
    ].join('\n');
    expect(toNarrationScript(body, 'nb').segments).toEqual([
      { kind: 'paragraph', speaker: null, text: 'Backend-utvikler søkes til Nordly Tech AS' },
      {
        kind: 'paragraph',
        speaker: null,
        text: 'Vi ønsker at du: har erfaring med C# og .NET (eller tilsvarende bakgrunn fra Java). kan grunnleggende SQL.',
      },
      { kind: 'paragraph', speaker: null, text: 'Profil: Backend-utvikler med fem års erfaring.' },
    ]);
  });

  it('reads a quoted label as a turn when the name speaks elsewhere (norsk_it 5B)', () => {
    const body = [
      '**Ingrid:** Klart det, jeg ser på den nå.',
      '',
      '> **Ingrid (kommentar):** Denne variabelen har et litt uklart navn — hva',
      '> med å kalle den `søkeresultater` i stedet for `data`?',
      '',
      '> **Taras (svar):** Endret navnet til `søkeresultater`, takk!',
      '> **Taras (svar):** Her tenkte jeg egentlig annerledes.',
    ].join('\n');
    // Taras never speaks outside the quote here, so his replies stay document text.
    expect(toNarrationScript(body, 'nb').segments).toEqual([
      { kind: 'turn', speaker: 'Ingrid', text: 'Klart det, jeg ser på den nå.' },
      {
        kind: 'turn',
        speaker: 'Ingrid',
        text: 'Denne variabelen har et litt uklart navn — hva med å kalle den søkeresultater i stedet for data?',
      },
      {
        kind: 'paragraph',
        speaker: null,
        text: 'Taras (svar): Endret navnet til søkeresultater, takk! Taras (svar): Her tenkte jeg egentlig annerledes.',
      },
    ]);
  });

  it('keeps names in a meeting summary, where they assign tasks (norsk_it 6)', () => {
    const body = [
      '> **Oppfølgingspunkter:**',
      '> - Ingrid: Implementere løsningen innen fredag (egen',
      '>   gren og pull request).',
      '> - Mohammed: Lage automatiske tester',
    ].join('\n');
    expect(texts(body)).toEqual([
      'Oppfølgingspunkter: Ingrid: Implementere løsningen innen fredag (egen gren og pull request). Mohammed: Lage automatiske tester.',
    ]);
  });
});

describe('toNarrationScript — tables and lists', () => {
  it('skips a table: the reader shows it, a listener would hear a grid (norsk_it 10C)', () => {
    const body = [
      'Tallene i teksten:',
      '',
      '| Norsk skrivemåte | Betydning |',
      '|---|---|',
      '| 15 000 | femten tusen |',
      '| ca. / cirka / omtrent | ca., приблизительно |',
      '',
      'Så går vi videre.',
    ].join('\n');
    expect(texts(body)).toEqual(['Tallene i teksten:', 'Så går vi videre.']);
  });

  it('strips emoji (norsk_it 9B)', () => {
    expect(texts('Han svarer bare 👍 i chatten.\n\n**Mohammed:** 👍 Takk!')).toEqual([
      'Han svarer bare i chatten.',
      'Takk!',
    ]);
  });

  it('lists the speakers in the order they first speak', () => {
    const { segments } = toNarrationScript(
      'Taras åpner dokumentet.\n\n**Erik:** Én side.\n\n**Taras:** Alt?\n\n**Erik:** Nei.',
      'nb',
    );
    expect(narrationSpeakers(segments)).toEqual(['Erik', 'Taras']);
  });

  it('ends list items as sentences and keeps ordered items readable', () => {
    expect(
      texts('Vanlige temaer:\n- Været\n- Helgeplaner!\n1. Gå til «Produkter» → velg et produkt'),
    ).toEqual(['Vanlige temaer: Været. Helgeplaner! Gå til «Produkter», velg et produkt.']);
  });
});

describe('toNarrationScript — markup and media', () => {
  it('drops media tokens, links, rules, emphasis and code fences', () => {
    const body = [
      '[audio:abc-123 "Les teksten"]',
      '',
      '![Kontoret](media://img_1)',
      '',
      'Han bestemmer *hva* som skal lages, og [teamet](https://example.com) **hvordan**.',
      '',
      '---',
      '',
      '```',
      'const x = 1;',
      '```',
      '',
      '[video:vid_9]',
      '',
      'Variabelen heter `user_id` og snake_case_navn beholdes.',
    ].join('\n');
    expect(texts(body)).toEqual([
      'Han bestemmer hva som skal lages, og teamet hvordan.',
      'Variabelen heter user_id og snake_case_navn beholdes.',
    ]);
  });

  it('returns no segments for an empty or media-only body', () => {
    expect(toNarrationScript('', 'nb').segments).toEqual([]);
    expect(toNarrationScript('[audio:a1]\n\n![x](media://b2)', 'nb').segments).toEqual([]);
  });

  it('never emits a segment with markup left in it', () => {
    const body = '# Leksjon 2 — Første uker\n\n> **A:** b\n\n**Silje:** «Hei» — *ja*.\n\n| x | y |';
    for (const segment of toNarrationScript(body, 'nb').segments) {
      expect(segment.text).not.toMatch(/[*#>|`[\]]/);
    }
  });
});

describe('toNarrationScript — textHash', () => {
  const body = '## 2A — Onboarding\n\n**Silje:** Velkommen, Taras!\n\nDet er mandag morgen.';
  const hash = toNarrationScript(body, 'nb').textHash;

  it('is a sha256 hex digest', () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores media tokens and line wrapping', () => {
    const withMedia = `[audio:n1 "Les"]\n\n${body.replace('Det er mandag', 'Det er\nmandag')}\n\n![bilde](media://p1)`;
    expect(toNarrationScript(withMedia, 'nb').textHash).toBe(hash);
  });

  it('changes when a word changes', () => {
    expect(toNarrationScript(body.replace('mandag', 'tirsdag'), 'nb').textHash).not.toBe(hash);
  });

  it('changes with the language and the speaker', () => {
    expect(toNarrationScript(body, 'nn').textHash).not.toBe(hash);
    expect(toNarrationScript(body.replace('Silje', 'Erik'), 'nb').textHash).not.toBe(hash);
  });
});

describe('narrationPauseMs', () => {
  const turn: NarrationSegment = { kind: 'turn', speaker: 'Silje', text: 'Hei.' };
  const paragraph: NarrationSegment = { kind: 'paragraph', speaker: null, text: 'Det er mandag.' };

  it('uses the short pause between turns and the long one elsewhere (D2)', () => {
    expect(narrationPauseMs(turn, turn)).toBe(NARRATION_TURN_PAUSE_MS);
    expect(narrationPauseMs(turn, paragraph)).toBe(NARRATION_PARAGRAPH_PAUSE_MS);
    expect(narrationPauseMs(paragraph, paragraph)).toBe(NARRATION_PARAGRAPH_PAUSE_MS);
  });
});
