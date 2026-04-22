import { randomBytes } from "crypto";
import { AuthContext } from "./types";

type SessionRecord = {
  auth: AuthContext;
  expiresAt: number;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map<string, SessionRecord>();

const now = (): number => Date.now();

const cleanupExpired = (): void => {
  const current = now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= current) {
      sessions.delete(token);
    }
  }
};

export const createSession = (auth: AuthContext): string => {
  cleanupExpired();
  const token = randomBytes(24).toString("hex");
  sessions.set(token, {
    auth,
    expiresAt: now() + SESSION_TTL_MS
  });
  return token;
};

export const getSession = (token: string): AuthContext | null => {
  cleanupExpired();
  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= now()) {
    sessions.delete(token);
    return null;
  }

  return session.auth;
};
