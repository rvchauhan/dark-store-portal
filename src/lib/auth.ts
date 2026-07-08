import { useSyncExternalStore } from "react";

export type Role = "admin" | "manager";
export type Session = { name: string; role: Role; email: string } | null;

const KEY = "qc_session";
const listeners = new Set<() => void>();

function read(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function signIn(role: Role) {
  const session: Session =
    role === "admin"
      ? { name: "Sarah Jenkins", role, email: "admin@qcommerce.io" }
      : { name: "Alex Thompson", role, email: "manager.402@qcommerce.io" };
  localStorage.setItem(KEY, JSON.stringify(session));
  listeners.forEach((l) => l());
}

export function signOut() {
  localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function useSession(): Session {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = () => cb();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => null,
  );
}
