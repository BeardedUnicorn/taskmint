import type { TaskSession } from '../types/timer';

export type SessionSubscriber = (sessions: TaskSession[]) => void;

class SessionStore {
  private sessions: TaskSession[] = [];
  private subscribers: Set<SessionSubscriber> = new Set();

  getSessions(): TaskSession[] {
    return this.sessions;
  }

  setSessions(sessions: TaskSession[]): void {
    this.sessions = sessions;
    this.notify();
  }

  getSession(id: string): TaskSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  updateSession(session: TaskSession): void {
    const index = this.sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      this.sessions[index] = session;
    } else {
      this.sessions.push(session);
    }
    this.notify();
  }

  deleteSession(id: string): void {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this.notify();
  }

  subscribe(fn: SessionSubscriber): () => void {
    this.subscribers.add(fn);
    fn(this.sessions);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    this.subscribers.forEach(fn => fn(this.sessions));
  }
}

export const sessionStore = new SessionStore();
