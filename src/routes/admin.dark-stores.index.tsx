import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { listStoresApi } from "@/lib/api";

export const Route = createFileRoute("/admin/dark-stores/")({
  component: DarkStores,
});

function DarkStores() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["stores"],
    queryFn: () => listStoresApi(),
  });

  const stores = data?.data ?? [];
  const active = stores.filter((s) => s.status === "active").length;

  const q = search.trim().toLowerCase();
  const visibleStores = q
    ? stores.filter((s) => `${s.name} ${s.code ?? ""} ${s.id}`.toLowerCase().includes(q))
    : stores;

  return (
    <AppShell
      role="admin"
      searchPlaceholder="Search by Store Name or ID…"
      searchValue={search}
      onSearchChange={setSearch}
      primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}
    >
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Dark Stores" }]}
        title="Dark Store Network"
        actions={
          <Link
            to="/admin/dark-stores/new"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">add_business</span>
            Add Dark Store
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon="mediation" label="Total Stores" value={String(stores.length)} />
        <StatCard icon="check_circle" label="Active Hubs" value={String(active)} tone="success" />
        <StatCard
          icon="pending"
          label="Onboarding"
          value={String(stores.filter((s) => s.status === "onboarding").length)}
        />
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive">Failed to load stores — is the API running?</p>
      )}
      {isLoading && <p className="mb-4 text-sm text-on-surface-variant">Loading stores…</p>}
      {!isLoading && q && (
        <p className="mb-4 text-sm text-on-surface-variant">
          {visibleStores.length} of {stores.length} stores match "{search}"
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {visibleStores.map((s) => (
          <Link
            key={s.id}
            to="/admin/dark-stores/$storeId"
            params={{ storeId: s.id }}
            className="bg-surface rounded-2xl border border-outline-variant shadow-sm flex flex-col overflow-hidden text-left hover:border-primary/50 hover:shadow-md transition-all"
          >
            <div className="h-28 bg-surface-container-low flex items-center justify-center relative border-b border-outline-variant">
              <span
                className={`absolute top-4 right-4 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded-full border ${
                  s.status === "active"
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                }`}
              >
                {s.status}
              </span>
              <div className="w-12 h-12 bg-surface rounded-full shadow-md flex items-center justify-center border border-outline-variant text-primary">
                <span className="material-symbols-outlined">store</span>
              </div>
            </div>
            <div className="p-5 flex flex-col flex-1">
              <h3 className="font-extrabold text-on-surface text-lg leading-tight">{s.name}</h3>
              <p className="text-xs text-on-surface-variant mt-1.5">{s.code ?? s.id.slice(0, 8)}</p>
              <p className="text-xs text-on-surface-variant mt-3 line-clamp-2">{s.address}</p>
            </div>
          </Link>
        ))}

        <Link
          to="/admin/dark-stores/new"
          className="bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant hover:border-primary/50 transition-colors flex flex-col items-center justify-center p-6 text-center group min-h-[240px]"
        >
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[28px]">add_business</span>
          </div>
          <h3 className="font-bold text-primary text-base mb-1">Add New Dark Store</h3>
        </Link>
      </div>
    </AppShell>
  );
}
