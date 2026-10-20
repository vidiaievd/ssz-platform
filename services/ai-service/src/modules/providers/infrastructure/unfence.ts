/**
 * Without a JSON response mode a model tends to wrap its JSON in a markdown fence; the
 * fence is stripped so `SchemaGuard` sees the JSON itself.
 */
export function unfence(text: string): string {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return match ? match[1]! : text;
}
