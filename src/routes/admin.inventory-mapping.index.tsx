import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { listSkuMappingsApi, listSkusApi, listStoresApi } from "@/lib/api";

export const Route = createFileRoute("/admin/inventory-mapping/")({
  component: InventoryMapping,
});

function InventoryMapping() {
  const navigate = useNavigate();
  const storesQuery = useQuery({
    queryKey: ["stores"],
    queryFn: () => listStoresApi(),
  });
  const skusQuery = useQuery({
    queryKey: ["catalog", "skus"],
    queryFn: () => listSkusApi(),
  });

  const stores = storesQuery.data?.data ?? [];
  const catalogTotal = skusQuery.data?.data.length ?? 0;

  const mappingQueries = useQueries({
    queries: stores.map((store) => ({
      queryKey: ["stores", store.id, "sku-mappings"],
      queryFn: () => listSkuMappingsApi(store.id),
      enabled: stores.length > 0,
    })),
  });

  const rows = stores.map((store, i) => {
    const mapped = mappingQueries[i]?.data?.data.length ?? 0;
    const coverage = catalogTotal > 0 ? Math.round((mapped / catalogTotal) * 100) : 0;
    const gaps = Math.max(catalogTotal - mapped, 0);
    return { store, mapped, coverage, gaps };
  });

  const totalMappings = rows.reduce((sum, r) => sum + r.mapped, 0);
  const avgCoverage =
    rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.coverage, 0) / rows.length) : 0;
  const totalGaps = rows.reduce((sum, r) => sum + r.gaps, 0);
  const loading = storesQuery.isLoading || skusQuery.isLoading || mappingQueries.some((q) => q.isLoading);

  return (
    <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Inventory Mapping" }]}
        title="Inventory"
        subtitle="Map SKUs to fulfillment hubs and monitor coverage gaps."
        actions={
          <Link
            to="/admin/dark-stores/new"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">add_business</span>
            Map New Store
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="hub" label="Total Mappings" value={String(totalMappings)} />
        <StatCard icon="check_circle" label="Avg. Coverage" value={`${avgCoverage}%`} tone="success" />
        <StatCard icon="warning" label="Coverage Gaps" value={String(totalGaps)} tone="warning" />
        <StatCard
          icon="update"
          label="Catalog SKUs"
          value={String(catalogTotal)}
        />
      </div>

      {(storesQuery.error || skusQuery.error) && (
        <p className="mb-4 text-sm text-destructive">Failed to load mapping data — is the API running?</p>
      )}
      {loading && <p className="mb-4 text-sm text-on-surface-variant">Loading coverage…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">Bulk map SKUs</h3>
          <p className="text-sm text-on-surface-variant mb-4">
            Open a store onboarding wizard to assign SKUs one-by-one or upload a CSV batch.
          </p>
          <div className="space-y-3">
            <Link
              to="/admin/dark-stores/new"
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 text-sm font-semibold"
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">upload_file</span>
                Upload CSV (per store)
              </span>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                chevron_right
              </span>
            </Link>
            <Link
              to="/admin/master-catalog"
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 text-sm font-semibold"
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">category</span>
                Review Master Catalog
              </span>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                chevron_right
              </span>
            </Link>
            <Link
              to="/admin/dark-stores"
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 text-sm font-semibold"
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">store</span>
                Browse Dark Stores
              </span>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                chevron_right
              </span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-3 bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
            <h3 className="font-bold text-on-surface">Coverage by store</h3>
            <Link to="/admin/dark-stores" className="text-xs text-primary font-semibold">
              View all →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Store</th>
                <th className="px-6 py-3 text-left font-semibold">SKUs</th>
                <th className="px-6 py-3 text-left font-semibold">Coverage</th>
                <th className="px-6 py-3 text-left font-semibold">Gaps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-on-surface-variant text-center">
                    No stores yet.{" "}
                    <Link to="/admin/dark-stores/new" className="text-primary font-semibold">
                      Add a dark store
                    </Link>
                  </td>
                </tr>
              )}
              {rows.map((m) => (
                <tr
                  key={m.store.id}
                  onClick={() =>
                    navigate({
                      to: "/admin/dark-stores/$storeId/edit",
                      params: { storeId: m.store.id },
                      search: { step: 3 },
                    })
                  }
                  className="hover:bg-surface-container-low cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium">
                    {m.store.name}
                    {m.store.code ? (
                      <span className="block text-xs text-on-surface-variant font-normal">
                        {m.store.code}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4">{m.mapped.toLocaleString()}</td>
                  <td className="px-6 py-4 w-48">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            m.coverage >= 85
                              ? "bg-[oklch(0.62_0.16_155)]"
                              : m.coverage >= 70
                                ? "bg-primary"
                                : "bg-[oklch(0.75_0.16_75)]"
                          }`}
                          style={{ width: `${m.coverage}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-8">{m.coverage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-destructive font-semibold">{m.gaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
