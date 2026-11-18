import { schoolLifecycleTemplate } from '../../../src/infrastructure/email/templates/school-lifecycle.template.js';

describe('schoolLifecycleTemplate', () => {
  const base = { schoolName: 'Nordic <Skole>', closesAt: '2026-12-11T10:00:00.000Z', purgeAt: '2027-05-12T10:00:00.000Z' };

  it.each(['uk', 'ru', 'nb', 'en'])('names the school in every letter (%s)', (locale) => {
    for (const letter of ['suspended', 'closed', 'restored', 'purge_reminder'] as const) {
      const out = schoolLifecycleTemplate({ ...base, letter, locale, daysLeft: 7 });
      expect(out.subject).toContain('Nordic <Skole>');
      expect(out.text).toContain('Nordic <Skole>');
    }
  });

  it('escapes the school name in html', () => {
    const out = schoolLifecycleTemplate({ ...base, letter: 'closed', locale: 'en' });
    expect(out.html).toContain('Nordic &lt;Skole&gt;');
    expect(out.html).not.toContain('<Skole>');
  });

  it('puts the purge date and the days left into the reminder', () => {
    const out = schoolLifecycleTemplate({ ...base, letter: 'purge_reminder', locale: 'en', daysLeft: 30 });
    expect(out.subject).toContain('30 days');
    expect(out.text).toContain('2027');
  });

  it('says when the suspended school closes by itself', () => {
    const out = schoolLifecycleTemplate({ ...base, letter: 'suspended', locale: 'nb' });
    expect(out.text).toContain('2026');
    expect(out.subject).toContain('midlertidig');
  });

  it('reads English for an unknown or missing locale and nb for "no"', () => {
    expect(schoolLifecycleTemplate({ ...base, letter: 'restored', locale: null }).subject).toContain('restored');
    expect(schoolLifecycleTemplate({ ...base, letter: 'restored', locale: 'fr' }).subject).toContain('restored');
    expect(schoolLifecycleTemplate({ ...base, letter: 'restored', locale: 'no' }).subject).toContain('gjenopprettet');
  });

  it('survives a missing or broken date', () => {
    const out = schoolLifecycleTemplate({ schoolName: 'S', letter: 'closed', locale: 'en', purgeAt: 'nonsense' });
    expect(out.text).toContain('soon');
  });
});
