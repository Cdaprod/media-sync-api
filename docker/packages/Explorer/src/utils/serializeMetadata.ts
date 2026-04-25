/**
 * Normalize arbitrary metadata values into a string-only record for connect/register transport.
 *
 * Example:
 *   const payload = serializeMetadata({ enabled: true, tags: ['ios'] });
 */
export function serializeMetadata(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}
