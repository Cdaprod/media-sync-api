export function normalizeArrayPayload<T>(payload: unknown, keys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload.filter(Boolean) as T[];

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = obj[key];
      if (Array.isArray(value)) return value.filter(Boolean) as T[];
    }
  }

  return [];
}
