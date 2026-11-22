import { escapeHtml, formatEmailDate, pickEmailLocale, sentence, type EmailLocale } from './email-locale.js';

export interface SchoolInvitationTemplateData {
  schoolName: string;
  invitationUrl: string;
  /** `MemberRole` of the invitation (`STUDENT`, `TEACHER`, …). */
  role: string;
  expiresAt: string;
  /**
   * Language of the letter (plan 90, session 16 remark 3): the invitee's `uiLocale` when the
   * address has an account, else the school's. Anything but uk / ru / nb reads English.
   */
  locale?: string | null;
}

// Same words as the web's role labels, so the letter and the screen it leads to agree.
const ROLE_LABELS: Record<string, Record<EmailLocale, string>> = {
  STUDENT: { uk: 'Студент', ru: 'Студент', nb: 'Elev', en: 'Student' },
  TEACHER: { uk: 'Вчитель', ru: 'Учитель', nb: 'Lærer', en: 'Teacher' },
  ADMIN: { uk: 'Адміністратор', ru: 'Администратор', nb: 'Administrator', en: 'Administrator' },
  MANAGER: { uk: 'Менеджер', ru: 'Менеджер', nb: 'Leder', en: 'Manager' },
  CONTENT_ADMIN: { uk: 'Редактор', ru: 'Редактор', nb: 'Innholdsadmin', en: 'Content Admin' },
  SCHEDULER: { uk: 'Планувальник', ru: 'Планировщик', nb: 'Planlegger', en: 'Scheduler' },
};

interface Copy {
  subject: string;
  invited: string;
  role: string;
  button: string;
  expires: string;
  fallbackLink: string;
  ignore: string;
}

function roleLabel(role: string, locale: EmailLocale): string {
  const known = ROLE_LABELS[role.toUpperCase()];
  if (known) return known[locale];
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function copyFor(data: SchoolInvitationTemplateData, locale: EmailLocale): Copy {
  // The school is named in quotes and never declined — the name is safe in every language and case.
  const name = `«${data.schoolName}»`;
  const role = roleLabel(data.role, locale);
  const date = formatEmailDate(data.expiresAt, locale);

  return {
    uk: {
      subject: `Запрошення до ${name}`,
      invited: `Вас запрошено приєднатися до ${name}.`,
      role: `Роль: ${role}.`,
      button: 'Прийняти запрошення',
      expires: date ? sentence(`Запрошення дійсне до ${date}`) : 'Запрошення діє обмежений час.',
      fallbackLink: 'Якщо кнопка не працює, скопіюйте посилання й відкрийте його в браузері:',
      ignore: 'Якщо ви не чекали цього запрошення, просто проігноруйте лист.',
    },
    ru: {
      subject: `Приглашение в ${name}`,
      invited: `Вас пригласили присоединиться к ${name}.`,
      role: `Роль: ${role}.`,
      button: 'Принять приглашение',
      expires: date ? sentence(`Приглашение действует до ${date}`) : 'Приглашение действует ограниченное время.',
      fallbackLink: 'Если кнопка не работает, скопируйте ссылку и откройте её в браузере:',
      ignore: 'Если вы не ждали этого приглашения, просто проигнорируйте письмо.',
    },
    nb: {
      subject: `Invitasjon til ${name}`,
      invited: `Du er invitert til å bli med i ${name}.`,
      role: `Rolle: ${role}.`,
      button: 'Godta invitasjonen',
      expires: date ? sentence(`Invitasjonen gjelder til ${date}`) : 'Invitasjonen gjelder en begrenset tid.',
      fallbackLink: 'Hvis knappen ikke virker, kopier lenken og åpne den i nettleseren:',
      ignore: 'Hvis du ikke ventet denne invitasjonen, kan du se bort fra e-posten.',
    },
    en: {
      subject: `You've been invited to join ${name}`,
      invited: `You've been invited to join ${name}.`,
      role: `Role: ${role}.`,
      button: 'Accept invitation',
      expires: date ? sentence(`This invitation expires on ${date}`) : 'This invitation is valid for a limited time.',
      fallbackLink: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't expect this invitation, you can safely ignore this email.",
    },
  }[locale];
}

export function schoolInvitationTemplate(data: SchoolInvitationTemplateData): { subject: string; html: string; text: string } {
  const locale = pickEmailLocale(data.locale);
  const copy = copyFor(data, locale);
  return invitationLetter(copy, data.invitationUrl, [copy.invited, copy.role]);
}

/** The layout both invitation letters share (school and private tutor). */
export function invitationLetter(
  copy: Pick<Copy, 'subject' | 'button' | 'expires' | 'fallbackLink' | 'ignore'>,
  invitationUrl: string,
  paragraphs: string[],
): { subject: string; html: string; text: string } {
  const url = escapeHtml(invitationUrl);
  const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="font-size: 20px;">${escapeHtml(copy.subject)}</h1>
        ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        <p style="margin: 32px 0;">
          <a href="${url}"
             style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${escapeHtml(copy.button)}
          </a>
        </p>
        <p style="color: #6B7280; font-size: 14px;">${escapeHtml(copy.expires)}</p>
        <p style="color: #6B7280; font-size: 14px;">
          ${escapeHtml(copy.fallbackLink)}<br/>
          <a href="${url}" style="color: #4F46E5;">${url}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;"/>
        <p style="color: #9CA3AF; font-size: 12px;">${escapeHtml(copy.ignore)}</p>
      </div>
    `;
  const text = `${copy.subject}\n\n${paragraphs.join('\n')}\n\n${copy.fallbackLink}\n${invitationUrl}\n\n${copy.expires}\n\n${copy.ignore}`;
  return { subject: copy.subject, html, text };
}
