import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { signOut, useSession } from "@/lib/auth";
import { getStoreApi } from "@/lib/api";
import { useEffect } from "react";

type NavItem = { to: string; icon: string; label: string };

const adminNav: NavItem[] = [
  { to: "/admin", icon: "dashboard", label: "Dashboard" },
  { to: "/admin/master-catalog", icon: "inventory_2", label: "Master Catalog" },
  { to: "/admin/dark-stores", icon: "store", label: "Dark Stores" },
  { to: "/admin/inventory-mapping", icon: "map_search", label: "Inventory" },
  { to: "/admin/pricing", icon: "payments", label: "Pricing" },
  { to: "/admin/analytics", icon: "monitoring", label: "Analytics" },
];

const managerNav: NavItem[] = [
  { to: "/manager", icon: "dashboard", label: "Dashboard" },
  { to: "/manager/inventory", icon: "inventory_2", label: "Inventory" },
  { to: "/manager/ledger", icon: "history", label: "Ledger" },
  { to: "/manager/orders", icon: "shopping_cart", label: "Orders" },
  { to: "/manager/settings", icon: "settings", label: "Settings" },
];

export function AppShell({
  role,
  children,
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  primaryAction,
  shellTitle,
}: {
  role: "admin" | "manager";
  children: ReactNode;
  searchPlaceholder?: string;
  /** Pass together with onSearchChange to make the header search box actually filter this page. */
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  primaryAction?: { label: string; icon?: string; to?: string; onClick?: () => void };
  shellTitle?: string;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = role === "admin" ? adminNav : managerNav;

  // Manager sidebar must show the manager's ACTUAL store, not a hardcoded
  // placeholder — different managers are scoped to different stores.
  const storeQuery = useQuery({
    queryKey: ["store", session?.storeId],
    queryFn: () => getStoreApi(session!.storeId!),
    enabled: role === "manager" && Boolean(session?.storeId),
  });

  const brand =
    role === "admin"
      ? { title: "Q-Commerce", sub: "Central Management", icon: "hub" }
      : {
          title: storeQuery.data?.name ?? "Loading store…",
          sub: "Active Session",
          icon: "storefront",
        };
  const initials =
    session?.name
      .split(" ")
      .map((s) => s[0])
      .join("") ?? "";

  useEffect(() => {
    if (!session) navigate({ to: "/auth" });
    else if (session.role !== role)
      navigate({ to: session.role === "admin" ? "/admin" : "/manager" });
  }, [session, role, navigate]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 h-full w-[260px] bg-surface border-r border-outline-variant flex flex-col z-50">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
              <span className="material-symbols-outlined text-[20px]">{brand.icon}</span>
            </div>
            <h1 className="text-xl font-bold text-on-surface tracking-tight">{brand.title}</h1>
          </div>
          {role === "admin" ? (
            <p className="text-on-surface-variant text-xs ml-11">{brand.sub}</p>
          ) : (
            <div className="mt-6 rounded-3xl bg-surface-container-low px-5 py-4">
              <p className="text-base font-bold text-on-surface">{brand.title}</p>
              <p className="text-xs text-on-surface-variant mt-1">{brand.sub}</p>
            </div>
          )}
        </div>
        <nav className="px-4 space-y-1 mt-2">
          {nav.map((item) => {
            const active =
              item.to === `/${role}` ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-full transition-colors text-sm ${
                  active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 mt-auto border-t border-outline-variant">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{session.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold">
                {role === "admin" ? "Super Admin" : "Store Manager"}
              </p>
            </div>
            <button
              onClick={() => {
                signOut();
                navigate({ to: "/auth" });
              }}
              className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high"
              title="Sign out"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-[260px] min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 h-16 flex justify-between items-center px-6 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
          <div className="flex items-center gap-4 flex-1">
            {role === "manager" && shellTitle && (
              <p className="text-2xl font-bold text-on-surface shrink-0 mr-4">{shellTitle}</p>
            )}
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder={searchPlaceholder}
                {...(onSearchChange
                  ? { value: searchValue ?? "", onChange: (e) => onSearchChange(e.target.value) }
                  : {})}
                className="w-full bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {primaryAction &&
              role === "admin" &&
              (primaryAction.to ? (
                <Link
                  to={primaryAction.to}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20 active:scale-95 transition-transform"
                >
                  {primaryAction.icon && (
                    <span className="material-symbols-outlined text-[18px]">
                      {primaryAction.icon}
                    </span>
                  )}
                  {primaryAction.label}
                </Link>
              ) : (
                <button
                  onClick={primaryAction.onClick}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20 active:scale-95 transition-transform"
                >
                  {primaryAction.icon && (
                    <span className="material-symbols-outlined text-[18px]">
                      {primaryAction.icon}
                    </span>
                  )}
                  {primaryAction.label}
                </button>
              ))}
            <button
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full relative"
              title="Notifications — coming soon"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            {role === "manager" && (
              <>
                <button className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full">
                  <span className="material-symbols-outlined">dark_mode</span>
                </button>
                <div className="w-px h-6 bg-outline-variant" />
                <div className="flex items-center gap-3">
                  <div className="text-right leading-tight">
                    <p className="text-sm font-semibold text-on-surface">{session.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-primary font-bold">
                      Store Manager
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold">
                    {initials}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>
        <div className="flex-1 p-8 flex flex-col min-h-0">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  badge,
}: {
  crumbs?: { label: string; to?: string }[];
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
      <div>
        {crumbs && (
          <nav className="flex items-center gap-2 text-xs text-on-surface-variant mb-2">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                )}
                <span className={i === crumbs.length - 1 ? "text-primary font-bold" : ""}>
                  {c.label}
                </span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  delta,
  tone = "primary",
}: {
  icon: string;
  label: string;
  value: string;
  delta?: string;
  tone?: "primary" | "success" | "warning" | "error";
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.5_0.16_155)]",
    warning: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.55_0.16_75)]",
    error: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <div className="bg-surface p-5 rounded-2xl border border-outline-variant shadow-sm">
      <div className="flex justify-between items-start">
        <span className={`p-3 rounded-2xl material-symbols-outlined ${toneMap}`}>{icon}</span>
        {delta && (
          <span className="text-primary text-xs font-bold flex items-center gap-1">
            {delta}
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="text-on-surface-variant text-sm">{label}</p>
        <h3 className="text-3xl font-bold text-on-surface mt-1">{value}</h3>
      </div>
    </div>
  );
}
