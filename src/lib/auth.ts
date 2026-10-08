import { useEffect, useState, useSyncExternalStore } from "react";
import { loginApi, registerApi, googleAuthApi, acceptInviteApi } from "./api";
import { getToken, setToken } from "./api/client";
import { toPortalRole, type ApiRole, type PortalRole } from "./api/types";

/**
 * Client session store.
 * Persists JWT + user profile in localStorage and notifies React subscribers.
 */

export type Role = PortalRole;

export type Session = {
  name: string;
  email: string;
  /** Portal shell role: admin | manager */
  role: PortalRole;
  /** API role from JWT */
  apiRole: ApiRole;
  userId: string;
  businessId: string;
  storeId: string | null;
  token: string;
} | null;

const SESSION_KEY = "qc_session";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedSession: Session = null;

function notify() {
  listeners.forEach((l) => l());
}

function read(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === cachedRaw) return cachedSession;
    cachedRaw = raw;
    cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    return cachedSession;
  } catch {
    return null;
  }
}

function write(session: Session) {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setToken(session.token);
  } else {
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
  }
  cachedRaw = null;
  cachedSession = session;
  notify();
}

function sessionFromAuth(
  token: string,
  user: {
    userId: string;
    businessId: string;
    role: ApiRole;
    storeId: string | null;
    email: string;
    name: string;
  },
): NonNullable<Session> {
  return {
    token,
    name: user.name,
    email: user.email,
    role: toPortalRole(user.role),
    apiRole: user.role,
    userId: user.userId,
    businessId: user.businessId,
    storeId: user.storeId,
  };
}

/**
 * Real login against dark-store-api.
 * Maps API roles → portal roles used by AppShell.
 */
export async function signIn(email: string, password: string) {
  const { token, user } = await loginApi(email, password);
  const session = sessionFromAuth(token, user);
  write(session);
  return session;
}

/** Self-serve registration — creates tenant + admin, then stores the JWT session. */
export async function signUp(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}) {
  const { token, user } = await registerApi(input);
  const session = sessionFromAuth(token, user);
  write(session);
  return session;
}

/** Google Identity Services — exchange ID token for app JWT. */
export async function signInWithGoogle(idToken: string) {
  const { token, user } = await googleAuthApi(idToken);
  const session = sessionFromAuth(token, user);
  write(session);
  return session;
}

/** Invited manager sets their password via the setup link; response auto-logs them in. */
export async function acceptInvite(token: string, password: string) {
  const { token: jwt, user } = await acceptInviteApi({ token, password });
  const session = sessionFromAuth(jwt, user);
  write(session);
  return session;
}

export function signOut() {
  write(null);
}

/**
 * Session from localStorage.
 * Returns `undefined` until the client has hydrated — SSR/getServerSnapshot is
 * always null, so treating that as logged-out would bounce deep links to /auth
 * (then to /manager|/admin) on every refresh.
 */
export function useSession(): Session | undefined {
  const session = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = () => {
        cachedRaw = null;
        cb();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => null,
  );

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return undefined;
  return session;
}

/** Ensure token in localStorage stays in sync if session exists (SSR/hydration edge). */
export function hydrateTokenFromSession() {
  const session = read();
  if (session?.token && getToken() !== session.token) setToken(session.token);
}
