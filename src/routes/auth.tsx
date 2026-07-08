import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [role, setRole] = useState<"admin" | "manager">("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (session) navigate({ to: session.role === "admin" ? "/admin" : "/manager" });
  }, [session, navigate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(role);
    navigate({ to: role === "admin" ? "/admin" : "/manager" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-primary via-[oklch(0.45_0.24_290)] to-[oklch(0.35_0.22_300)] text-primary-foreground p-14 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <span className="material-symbols-outlined text-[26px]">hub</span>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Q-Commerce</h1>
              <p className="text-white/70 text-sm">Dark Store Operations</p>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h2 className="text-5xl font-extrabold leading-tight tracking-tight">
            Move product. Fast.
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Central control for your dark store network — catalog, inventory mapping, and live
            fulfillment for the on-demand economy.
          </p>
          <div className="grid grid-cols-3 gap-6 pt-4 max-w-md">
            {[
              { k: "42", l: "Dark Stores" },
              { k: "18k+", l: "SKUs" },
              { k: "10min", l: "Avg. delivery" },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-3xl font-extrabold">{s.k}</p>
                <p className="text-white/70 text-xs uppercase tracking-wider">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/50 text-xs">© 2026 Q-Commerce Operations Inc.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
          <div>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Sign in</h2>
            <p className="text-on-surface-variant text-sm mt-2">
              Choose your role to enter the operations console.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-1 bg-surface-container-low rounded-full">
            {(["admin", "manager"] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`py-2.5 rounded-full text-sm font-semibold transition-all capitalize ${
                  role === r
                    ? "bg-surface text-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {r === "admin" ? "Super Admin" : "Store Manager"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  role === "admin" ? "admin@qcommerce.io" : "manager.402@qcommerce.io"
                }
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-semibold text-sm shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            Continue to {role === "admin" ? "Admin" : "Manager"} console
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>

          <p className="text-xs text-on-surface-variant text-center">
            Demo credentials accept anything. Role toggle above chooses the workspace.
          </p>
        </form>
      </div>
    </div>
  );
}
