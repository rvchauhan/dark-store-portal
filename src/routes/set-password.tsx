import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthCard, AuthMarketingLayout } from "@/components/AuthMarketingLayout";
import { getInviteApi } from "@/lib/api";
import { acceptInvite } from "@/lib/auth";
import { ApiError } from "@/lib/api/types";

export const Route = createFileRoute("/set-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ email: string; name: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("This link is missing its setup token.");
      return;
    }
    getInviteApi(token)
      .then(setInvite)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "This invite link is invalid or has expired."),
      );
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const session = await acceptInvite(token, password);
      navigate({ to: session.role === "admin" ? "/admin" : "/manager" });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  const headerAction = (
    <Link to="/auth" className="text-sm font-semibold text-primary underline underline-offset-4">
      Back to Sign In
    </Link>
  );

  if (loadError) {
    return (
      <AuthMarketingLayout headerAction={headerAction}>
        <AuthCard title="Invite link invalid" subtitle="This setup link couldn't be verified.">
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{loadError}</p>
          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Ask your admin to send you a new setup link from the Dark Stores page.
          </p>
        </AuthCard>
      </AuthMarketingLayout>
    );
  }

  return (
    <AuthMarketingLayout headerAction={headerAction}>
      <AuthCard
        title="Set Your Password"
        subtitle={invite ? `Setting up the account for ${invite.email}` : "Loading your invite…"}
      >
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">New Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                lock
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
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
            <p className="mt-1 text-xs text-on-surface-variant">At least 8 characters.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface border border-outline-variant rounded-2xl px-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={loading || !invite}
            className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-60"
          >
            {loading ? "Setting up…" : "Set Password & Sign In"}
          </button>
        </form>
      </AuthCard>
    </AuthMarketingLayout>
  );
}
