import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/types";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number>,
          ) => void;
        };
      };
    };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGis = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/**
 * Screenshot-matching Google CTA.
 * Uses Google Identity Services; requires VITE_GOOGLE_CLIENT_ID.
 */
export function GoogleSignInButton({
  onCredential,
  label = "Google",
  disabled,
}: {
  onCredential: (idToken: string) => Promise<void> | void;
  label?: string;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCredential = useCallback(
    async (idToken: string) => {
      setBusy(true);
      setError(null);
      try {
        await onCredential(idToken);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Google sign-in failed");
      } finally {
        setBusy(false);
      }
    },
    [onCredential],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void handleCredential(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("Unable to load Google sign-in");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleCredential]);

  const onClick = () => {
    if (!GOOGLE_CLIENT_ID) return;
    if (!ready || !window.google) {
      setError("Google sign-in is still loading — try again in a moment.");
      return;
    }
    setError(null);
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setError("Google sign-in was blocked or dismissed. Check allowed origins in Google Cloud Console.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || busy || (!!GOOGLE_CLIENT_ID && !ready)}
        onClick={onClick}
        className="w-full flex items-center justify-center gap-3 py-3.5 rounded-full border border-outline-variant bg-surface text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? "Connecting…" : label}
      </button>
      {!GOOGLE_CLIENT_ID && (
        <p className="text-[11px] text-center text-on-surface-variant">
          Set <span className="font-semibold">VITE_GOOGLE_CLIENT_ID</span> (and API{" "}
          <span className="font-semibold">GOOGLE_CLIENT_ID</span>) to enable Google.
        </p>
      )}
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.227 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
