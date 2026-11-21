import { schoolInvitationTemplate } from '../../../src/infrastructure/email/templates/school-invitation.template.js';
import { tutoringInvitationTemplate } from '../../../src/infrastructure/email/templates/tutoring-invitation.template.js';

describe('schoolInvitationTemplate', () => {
  const base = {
    schoolName: 'Nordic <Skole>',
    invitationUrl: 'https://app.example/invite/tok?a=1&b=2',
    role: 'TEACHER',
    expiresAt: '2026-11-28T10:00:00.000Z',
  };

  it.each([
    ['uk', 'Запрошення до «Nordic <Skole>»', 'Роль: Вчитель.', 'листопада'],
    ['ru', 'Приглашение в «Nordic <Skole>»', 'Роль: Учитель.', 'ноября'],
    ['nb', 'Invitasjon til «Nordic <Skole>»', 'Rolle: Lærer.', 'november'],
    ['en', "You've been invited to join «Nordic <Skole>»", 'Role: Teacher.', 'November'],
  ])('writes the letter in %s', (locale, subject, role, month) => {
    const out = schoolInvitationTemplate({ ...base, locale });
    expect(out.subject).toBe(subject);
    expect(out.text).toContain(role);
    expect(out.text).toContain(month);
    expect(out.text).toContain(base.invitationUrl);
  });

  it('reads English for an unknown or missing language, and Bokmål for no / nn', () => {
    expect(schoolInvitationTemplate({ ...base, locale: 'de' }).subject).toContain("You've been invited");
    expect(schoolInvitationTemplate({ ...base, locale: null }).subject).toContain("You've been invited");
    expect(schoolInvitationTemplate({ ...base, locale: 'nn' }).subject).toContain('Invitasjon til');
    expect(schoolInvitationTemplate({ ...base, locale: 'uk-UA' }).subject).toContain('Запрошення до');
  });

  // uk / ru dates end with their own dot («2026 р.»); the sentence must not add a second one.
  it.each(['uk', 'ru', 'nb', 'en'])('never doubles a dot after the date (%s)', (locale) => {
    const out = schoolInvitationTemplate({ ...base, locale });
    expect(out.text).not.toMatch(/\.\./);
    expect(out.html).not.toMatch(/\.\./);
  });

  it('names every invitable role and keeps an unknown one readable', () => {
    for (const role of ['STUDENT', 'TEACHER', 'ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'SCHEDULER']) {
      expect(schoolInvitationTemplate({ ...base, role, locale: 'uk' }).text).not.toContain(role);
    }
    expect(schoolInvitationTemplate({ ...base, role: 'OBSERVER', locale: 'en' }).text).toContain('Role: Observer.');
  });

  it('escapes the school name and the link in html', () => {
    const out = schoolInvitationTemplate({ ...base, locale: 'en' });
    expect(out.html).toContain('Nordic &lt;Skole&gt;');
    expect(out.html).not.toContain('<Skole>');
    expect(out.html).toContain('tok?a=1&amp;b=2');
  });

  it('survives a broken expiry date', () => {
    const out = schoolInvitationTemplate({ ...base, expiresAt: 'nope', locale: 'uk' });
    expect(out.text).toContain('Запрошення діє обмежений час.');
  });
});

describe('tutoringInvitationTemplate', () => {
  const base = { tutorName: 'Kari Nordmann', invitationUrl: 'https://app.example/invite/t', expiresAt: '2026-11-28T10:00:00.000Z' };

  it.each([
    ['uk', 'Kari Nordmann запрошує вас на заняття'],
    ['ru', 'Kari Nordmann приглашает вас на занятия'],
    ['nb', 'Kari Nordmann inviterer deg til timer'],
    ['en', 'Kari Nordmann invited you to learn together'],
  ])('writes the letter in %s and never says "school"', (locale, subject) => {
    const out = tutoringInvitationTemplate({ ...base, locale });
    expect(out.subject).toBe(subject);
    expect(out.text.toLowerCase()).not.toMatch(/school|школ|skole/);
    expect(out.text).not.toMatch(/\.\./);
  });

  it('reads "your tutor" in the letter language when the name is a placeholder', () => {
    expect(tutoringInvitationTemplate({ ...base, tutorName: 'Your tutor', locale: 'uk' }).subject).toBe('Запрошення на заняття з репетитором');
    expect(tutoringInvitationTemplate({ ...base, tutorName: '', locale: 'nb' }).text).toContain('Privatlæreren din');
    expect(tutoringInvitationTemplate({ ...base, tutorName: 'Your tutor', locale: 'uk' }).text).not.toContain('Your tutor');
  });
});
