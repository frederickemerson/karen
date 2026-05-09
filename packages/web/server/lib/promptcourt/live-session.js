const LIVE_SESSION_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_EVENTS_PER_SESSION = 200;

const sessions = new Map();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastEventAt > LIVE_SESSION_TTL_MS) {
      session.emit('session', { status: 'ended', reason: 'timeout' });
      sessions.delete(sessionId);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

const ensureSession = (sessionId, metadata = {}) => {
  let session = sessions.get(sessionId);
  if (!session) {
    const listeners = new Set();
    session = {
      id: sessionId,
      metadata: { ...metadata, startedAt: Date.now() },
      lastEventAt: Date.now(),
      events: [],
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit(eventType, data) {
        this.lastEventAt = Date.now();
        const event = { type: eventType, data, timestamp: Date.now() };
        this.events.push(event);
        if (this.events.length > MAX_EVENTS_PER_SESSION) {
          this.events.splice(0, this.events.length - MAX_EVENTS_PER_SESSION);
        }
        for (const listener of listeners) {
          try { listener(event); } catch { /* ignore */ }
        }
      },
      getState() {
        return {
          id: this.id,
          metadata: this.metadata,
          lastEventAt: this.lastEventAt,
          eventCount: this.events.length,
          subscriberCount: listeners.size,
        };
      },
    };
    sessions.set(sessionId, session);
  }
  return session;
};

export const createLiveSessionManager = () => ({
  broadcast(sessionId, eventType, data, metadata) {
    const session = ensureSession(sessionId, metadata);
    session.emit(eventType, data);
    return session;
  },

  subscribe(sessionId, listener) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.subscribe(listener);
  },

  getSession(sessionId) {
    return sessions.get(sessionId)?.getState() ?? null;
  },

  getCatchupEvents(sessionId) {
    return sessions.get(sessionId)?.events.slice() ?? [];
  },

  endSession(sessionId, reason = 'completed') {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.emit('session', { status: 'ended', reason });
    sessions.delete(sessionId);
  },

  listActiveSessions() {
    return [...sessions.values()].map((s) => s.getState());
  },

  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastEventAt > LIVE_SESSION_TTL_MS) {
        session.emit('session', { status: 'ended', reason: 'timeout' });
        sessions.delete(sessionId);
      }
    }
    return sessions.size;
  },
});
