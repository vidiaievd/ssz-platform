import { formatEmailDate, pickEmailLocale, sentence } from './email-locale.js';
import { invitationLetter } from './school-invitation.template.js';

export interface TutoringInvitationTemplateData {
  tutorName: string;
  invitationUrl: string;
  expiresAt: string;
  /** Language of the letter: the invitee's `uiLocale`, else the tutor's. Anything but uk / ru / nb reads English. */
  locale?: string | null;
}

// Organization fills these in when the tutor's profile has no name (older events carry them too).
const NAME_PLACEHOLDERS = new Set(['', 'your tutor']);

/** The letter for a private tutor's workspace: it never says "school". */
export function tutoringInvitationTemplate(data: TutoringInvitationTemplateData): { subject: string; html: string; text: string } {
  const locale = pickEmailLocale(data.locale);
  const named = !NAME_PLACEHOLDERS.has(data.tutorName.trim().toLowerCase());
  const tutor = data.tutorName.trim();
  const date = formatEmailDate(data.expiresAt, locale);

  const copy = {
    uk: {
      subject: named ? `${tutor} запрошує вас на заняття` : 'Запрошення на заняття з репетитором',
      invited: named ? `${tutor} запрошує вас на свої заняття.` : 'Ваш репетитор запрошує вас на свої заняття.',
      button: 'Прийняти запрошення',
      expires: date ? sentence(`Запрошення дійсне до ${date}`) : 'Запрошення діє обмежений час.',
      fallbackLink: 'Якщо кнопка не працює, скопіюйте посилання й відкрийте його в браузері:',
      ignore: 'Якщо ви не чекали цього запрошення, просто проігноруйте лист.',
    },
    ru: {
      subject: named ? `${tutor} приглашает вас на занятия` : 'Приглашение на занятия с репетитором',
      invited: named ? `${tutor} приглашает вас на свои занятия.` : 'Ваш репетитор приглашает вас на свои занятия.',
      button: 'Принять приглашение',
      expires: date ? sentence(`Приглашение действует до ${date}`) : 'Приглашение действует ограниченное время.',
      fallbackLink: 'Если кнопка не работает, скопируйте ссылку и откройте её в браузере:',
      ignore: 'Если вы не ждали этого приглашения, просто проигнорируйте письмо.',
    },
    nb: {
      subject: named ? `${tutor} inviterer deg til timer` : 'Invitasjon til timer med privatlærer',
      invited: named ? `${tutor} inviterer deg til timene sine.` : 'Privatlæreren din inviterer deg til timene sine.',
      button: 'Godta invitasjonen',
      expires: date ? sentence(`Invitasjonen gjelder til ${date}`) : 'Invitasjonen gjelder en begrenset tid.',
      fallbackLink: 'Hvis knappen ikke virker, kopier lenken og åpne den i nettleseren:',
      ignore: 'Hvis du ikke ventet denne invitasjonen, kan du se bort fra e-posten.',
    },
    en: {
      subject: named ? `${tutor} invited you to learn together` : 'Your tutor invited you to learn together',
      invited: named ? `${tutor} has invited you to join their lessons.` : 'Your tutor has invited you to join their lessons.',
      button: 'Accept invitation',
      expires: date ? sentence(`This invitation expires on ${date}`) : 'This invitation is valid for a limited time.',
      fallbackLink: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't expect this invitation, you can safely ignore this email.",
    },
  }[locale];

  return invitationLetter(copy, data.invitationUrl, [copy.invited]);
}
