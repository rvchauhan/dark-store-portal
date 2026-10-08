import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AuthCard, AuthMarketingLayout } from "@/components/AuthMarketingLayout";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { signIn, signInWithGoogle, useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api/types";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: session.role === "admin" ? "/admin" : "/manager" });
  }, [session, navigate]);

  const goHome = (role: "admin" | "manager") => {
    navigate({ to: role === "admin" ? "/admin" : "/manager" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const s = await signIn(email.trim(), password);
      goHome(s.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed — is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = useCallback(async (idToken: string) => {
    const s = await signInWithGoogle(idToken);
    goHome(s.role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthMarketingLayout
      headerAction={
        <Link to="/register" className="text-sm font-semibold text-primary underline underline-offset-4">
          Create Account
        </Link>
      }
    >
      <AuthCard title="Sign In" subtitle="Welcome back to Q-Commerce operations.">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full bg-surface border border-outline-variant rounded-2xl px-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                lock
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface border border-outline-variant rounded-2xl pl-11 pr-12 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-xs text-on-surface-variant">or sign in with</span>
          </div>
        </div>

        <GoogleSignInButton onCredential={onGoogle} label="Google" disabled={loading} />

        <p className="mt-8 text-center text-sm text-on-surface-variant">
          New here?{" "}
          <Link to="/register" className="font-bold text-primary hover:underline">
            Create Account
          </Link>
        </p>

      </AuthCard>
    </AuthMarketingLayout>
  );
}
