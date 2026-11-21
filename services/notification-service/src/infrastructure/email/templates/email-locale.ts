/** The languages a letter is written in; anything else reads English. */
export type EmailLocale = 'uk' | 'ru' | 'nb' | 'en';

/** `uiLocale` / ISO 639-1 code → a letter language (`no` / `nn` read Bokmål). */
export function pickEmailLocale(raw: string | null | undefined): EmailLocale {
  const code = (raw ?? '').toLowerCase().slice(0, 2);
  if (code === 'uk' || code === 'ru' || code === 'nb') return code;
  if (code === 'no' || code === 'nn') return 'nb';
  return 'en';
}

/** A date as the reader writes it ("21 листопада 2026 р.", "21. november 2026"); `null` when missing or broken. */
export function formatEmailDate(iso: string | null | undefined, locale: EmailLocale): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'nb' ? 'nb-NO' : locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Ends a sentence with a dot unless it already has one — uk / ru dates end with «р.» / «г.». */
export function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}
