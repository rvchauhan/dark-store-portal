import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Shared chrome for Create Account / Sign In pages matching the marketing screenshot. */
export function AuthMarketingLayout({
  children,
  headerAction,
}: {
  children: ReactNode;
  headerAction: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f7f6f2] text-on-surface">
      <header className="flex items-center justify-between px-8 sm:px-12 py-6">
        <Link to="/auth" className="text-xl font-extrabold tracking-tight text-primary">
          Q-Commerce
        </Link>
        {headerAction}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-10">
        {children}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            Secure Encryption
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">eco</span>
            Sustainably Operated
          </span>
        </div>
      </main>

      <footer className="px-8 sm:px-12 py-6 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/70">
        <p className="text-sm font-extrabold text-primary">Q-Commerce</p>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-on-surface-variant">
          {["Privacy Policy", "Terms of Service", "Sustainability", "Contact Us"].map((label) => (
            <button key={label} type="button" className="underline underline-offset-2 hover:text-primary">
              {label}
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-[440px] bg-surface rounded-[28px] border border-outline-variant/80 shadow-[0_18px_50px_-28px_rgba(15,102,54,0.35)] px-8 sm:px-10 py-10">
      <div className="text-center mb-8">
        <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight text-primary">{title}</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
