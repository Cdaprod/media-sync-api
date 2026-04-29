const streams = new Map<string, MediaStream>();

export const StreamHub = {
  set(sessionId: string, stream: MediaStream) {
    streams.set(sessionId, stream);
  },
  get(sessionId: string) {
    return streams.get(sessionId) || null;
  },
  delete(sessionId: string) {
    streams.delete(sessionId);
  },
  listSessionIds() {
    return Array.from(streams.keys());
  },
};

