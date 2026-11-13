export type SchoolLifecycleLetter = 'suspended' | 'closed' | 'restored' | 'purge_reminder';

export interface SchoolLifecycleTemplateData {
  letter: SchoolLifecycleLetter;
  /** `uiLocale` of the owner; anything but uk / ru / nb reads English. */
  locale: string | null;
  schoolName: string;
  /** Suspended: when the school closes by itself. */
  closesAt?: string | null;
  /** Closed and reminders: when the data is deleted. */
  purgeAt?: string | null;
  /** Reminders only. */
  daysLeft?: number;
}

type Locale = 'uk' | 'ru' | 'nb' | 'en';

interface Copy {
  subject: string;
  paragraphs: string[];
}

const SUPPORT: Record<Locale, string> = {
  uk: 'Щоб повернути доступ, зверніться до підтримки платформи.',
  ru: 'Чтобы вернуть доступ, обратитесь в поддержку платформы.',
  nb: 'Kontakt plattformens support for å få tilgang tilbake.',
  en: 'To get access back, contact platform support.',
};

const FOOTER: Record<Locale, string> = {
  uk: 'Це автоматичний лист, відповідати на нього не потрібно.',
  ru: 'Это автоматическое письмо, отвечать на него не нужно.',
  nb: 'Dette er en automatisk e-post, du trenger ikke svare.',
  en: 'This is an automatic message, there is no need to reply.',
};

const UNKNOWN_DATE: Record<Locale, string> = { uk: 'найближчим часом', ru: 'в ближайшее время', nb: 'snart', en: 'soon' };

function pickLocale(raw: string | null): Locale {
  const code = (raw ?? '').toLowerCase().slice(0, 2);
  if (code === 'uk' || code === 'ru' || code === 'nb') return code;
  if (code === 'no' || code === 'nn') return 'nb';
  return 'en';
}

function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return UNKNOWN_DATE[locale];
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN_DATE[locale];
  return date.toLocaleDateString(locale === 'nb' ? 'nb-NO' : locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The sentences name the school and never say "school" about it: the same letter goes to a tutor's
// private workspace, and only the name is safe to put in a sentence in every language and case.
function copyFor(data: SchoolLifecycleTemplateData, locale: Locale): Copy {
  const name = `«${data.schoolName}»`;
  const closes = formatDate(data.closesAt, locale);
  const purge = formatDate(data.purgeAt, locale);
  const days = data.daysLeft ?? 0;

  switch (data.letter) {
    case 'suspended':
      return {
        uk: {
          subject: `${name}: доступ тимчасово обмежено`,
          paragraphs: [
            `Платформа призупинила ${name}. Учні й персонал бачать матеріали та історію, але нові роботи, перевірка й зміни недоступні.`,
            `Якщо нічого не змінити, до ${closes} усе буде переведено в архів.`,
            SUPPORT.uk,
          ],
        },
        ru: {
          subject: `${name}: доступ временно ограничен`,
          paragraphs: [
            `Платформа приостановила ${name}. Ученики и персонал видят материалы и историю, но новые работы, проверка и правки недоступны.`,
            `Если ничего не изменится, до ${closes} всё будет переведено в архив.`,
            SUPPORT.ru,
          ],
        },
        nb: {
          subject: `${name}: tilgangen er midlertidig begrenset`,
          paragraphs: [
            `Plattformen har satt ${name} på pause. Elever og ansatte ser fortsatt materiale og historikk, men nye innleveringer, vurdering og endringer er stengt.`,
            `Hvis ingenting endres, flyttes alt til arkivet ${closes}.`,
            SUPPORT.nb,
          ],
        },
        en: {
          subject: `${name}: access is temporarily limited`,
          paragraphs: [
            `The platform has suspended ${name}. Learners and staff can still read materials and history, but new work, reviewing and edits are closed.`,
            `If nothing changes, everything moves to the archive on ${closes}.`,
            SUPPORT.en,
          ],
        },
      }[locale];
    case 'closed':
      return {
        uk: {
          subject: `${name}: переведено в архів`,
          paragraphs: [
            `${name} закрито й переведено в архів. Викладачі втратили ролі, акаунти всіх людей залишилися.`,
            `Матеріали буде видалено ${purge}. Історія навчання учнів (спроби, прогрес, повторення) залишиться в них. Експорту курсів поки немає.`,
            SUPPORT.uk,
          ],
        },
        ru: {
          subject: `${name}: переведено в архив`,
          paragraphs: [
            `${name} закрыто и переведено в архив. Преподаватели потеряли роли, аккаунты всех людей сохранились.`,
            `Материалы будут удалены ${purge}. История обучения учеников (попытки, прогресс, повторения) останется у них. Экспорта курсов пока нет.`,
            SUPPORT.ru,
          ],
        },
        nb: {
          subject: `${name}: flyttet til arkivet`,
          paragraphs: [
            `${name} er stengt og flyttet til arkivet. Lærere har mistet rollene sine, men alle kontoer finnes fortsatt.`,
            `Materialet slettes ${purge}. Elevenes egen læringshistorikk (forsøk, framgang, repetisjon) blir hos dem. Eksport av kurs finnes ikke ennå.`,
            SUPPORT.nb,
          ],
        },
        en: {
          subject: `${name}: moved to the archive`,
          paragraphs: [
            `${name} has been closed and moved to the archive. Teachers lost their roles; every account stays.`,
            `The materials will be deleted on ${purge}. Learners keep their own study history (attempts, progress, repetition). There is no course export yet.`,
            SUPPORT.en,
          ],
        },
      }[locale];
    case 'restored':
      return {
        uk: {
          subject: `${name}: відновлено`,
          paragraphs: [
            `${name} відновлено з архіву, видалення матеріалів скасовано.`,
            'Підписку архівація скасувала й не повертає — її призначає адміністратор платформи.',
          ],
        },
        ru: {
          subject: `${name}: восстановлено`,
          paragraphs: [
            `${name} восстановлено из архива, удаление материалов отменено.`,
            'Подписку архивация отменила и не возвращает — её назначает администратор платформы.',
          ],
        },
        nb: {
          subject: `${name}: gjenopprettet`,
          paragraphs: [
            `${name} er gjenopprettet fra arkivet, og slettingen av materialet er avlyst.`,
            'Abonnementet ble avsluttet ved arkiveringen og kommer ikke tilbake av seg selv — plattformens administrator tildeler det.',
          ],
        },
        en: {
          subject: `${name}: restored`,
          paragraphs: [
            `${name} has been restored from the archive and the deletion of its materials is cancelled.`,
            'The subscription was cancelled when it closed and does not come back by itself — a platform admin assigns it.',
          ],
        },
      }[locale];
    case 'purge_reminder':
      return {
        uk: {
          subject: `${name}: матеріали буде видалено через ${days} дн.`,
          paragraphs: [
            `Дані ${name} буде видалено ${purge} (за ${days} дн.). Це незворотно.`,
            `Історія навчання учнів залишиться в них. ${SUPPORT.uk}`,
          ],
        },
        ru: {
          subject: `${name}: материалы будут удалены через ${days} дн.`,
          paragraphs: [
            `Данные ${name} будут удалены ${purge} (через ${days} дн.). Это необратимо.`,
            `История обучения учеников останется у них. ${SUPPORT.ru}`,
          ],
        },
        nb: {
          subject: `${name}: materialet slettes om ${days} dager`,
          paragraphs: [
            `Dataene til ${name} slettes ${purge} (om ${days} dager). Dette kan ikke angres.`,
            `Elevenes egen læringshistorikk blir hos dem. ${SUPPORT.nb}`,
          ],
        },
        en: {
          subject: `${name}: materials will be deleted in ${days} days`,
          paragraphs: [
            `The data of ${name} will be deleted on ${purge} (in ${days} days). This cannot be undone.`,
            `Learners keep their own study history. ${SUPPORT.en}`,
          ],
        },
      }[locale];
  }
}

export function schoolLifecycleTemplate(data: SchoolLifecycleTemplateData): { subject: string; html: string; text: string } {
  const locale = pickLocale(data.locale);
  const copy = copyFor(data, locale);

  const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="font-size: 20px;">${escapeHtml(copy.subject)}</h1>
        ${copy.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;"/>
        <p style="color: #9CA3AF; font-size: 12px;">${FOOTER[locale]}</p>
      </div>
    `;
  const text = `${copy.subject}\n\n${copy.paragraphs.join('\n\n')}\n\n${FOOTER[locale]}`;

  return { subject: copy.subject, html, text };
}
