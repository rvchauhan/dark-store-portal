import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AuthCard, AuthMarketingLayout } from "@/components/AuthMarketingLayout";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { signInWithGoogle, signUp, useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api/types";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const session = useSession();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
      const s = await signUp({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      goHome(s.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed — is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = useCallback(
    async (idToken: string) => {
      const s = await signInWithGoogle(idToken);
      goHome(s.role);
    },
    // navigate is stable enough for this page
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <AuthMarketingLayout
      headerAction={
        <Link to="/auth" className="text-sm font-semibold text-primary underline underline-offset-4">
          Sign In
        </Link>
      }
    >
      <AuthCard title="Create Account" subtitle="Experience commerce in its most natural form.">
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Full Name">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                person
              </span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-surface border border-outline-variant rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              />
            </div>
          </Field>

          <Field label="Email Address">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full bg-surface border border-outline-variant rounded-2xl px-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            />
          </Field>

          <Field label="Phone Number">
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-surface border border-outline-variant rounded-2xl px-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            />
          </Field>

          <Field label="Password">
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
          </Field>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="relative my-7">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-xs text-on-surface-variant">or sign up with</span>
          </div>
        </div>

        <GoogleSignInButton onCredential={onGoogle} disabled={loading} />

        <p className="mt-8 text-center text-sm text-on-surface-variant">
          Already have an account?{" "}
          <Link to="/auth" className="font-bold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </AuthCard>
    </AuthMarketingLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-on-surface mb-2">{label}</label>
      {children}
    </div>
  );
}
