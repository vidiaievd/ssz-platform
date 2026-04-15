import slugify from 'slugify';

const MAX_SLUG_LENGTH = 120;

/**
 * Converts a title string into a URL-safe kebab-case slug.
 * - Lowercases and removes special characters
 * - Transliterates Unicode/non-Latin characters
 * - Truncates to 120 characters (matches containers.slug column length)
 *
 * Does NOT guarantee uniqueness — callers must check for collisions and
 * append a numeric suffix ("-2", "-3", etc.) if needed.
 */
export function generateSlug(title: string): string {
  const raw = slugify(title, {
    lower: true,
    strict: true, // strips anything not alphanumeric or separator
    trim: true,
  });

  return raw.slice(0, MAX_SLUG_LENGTH);
}

/**
 * Given a base slug and a set of already-taken slugs, returns a unique slug
 * by appending "-2", "-3", etc. until a free value is found.
 *
 * Designed to be called by repository implementations that have access to
 * the actual DB state.
 */
export function resolveUniqueSlug(
  baseSlug: string,
  isTaken: (candidate: string) => boolean,
): string {
  if (!isTaken(baseSlug)) return baseSlug;

  let counter = 2;
  while (true) {
    const suffix = `-${counter}`;
    // Ensure the suffixed slug still fits within the column limit.
    const truncatedBase = baseSlug.slice(0, MAX_SLUG_LENGTH - suffix.length);
    const candidate = `${truncatedBase}${suffix}`;

    if (!isTaken(candidate)) return candidate;
    counter++;
  }
}
