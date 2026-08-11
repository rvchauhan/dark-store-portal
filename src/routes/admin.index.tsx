import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { getDashboardStatsApi } from "@/lib/api";
import type { StorePickedStat } from "@/lib/api/types";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

/** Values lead (Strong, high-contrast); the store name follows as secondary — see dataviz tooltip spec. */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: StorePickedStat }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-surface border border-outline-variant rounded-xl px-3 py-2 shadow-md">
      <p className="text-sm font-bold text-on-surface">{row.pickedUnits.toLocaleString()} units</p>
      <p className="text-xs text-on-surface-variant">{row.storeName}</p>
    </div>
  );
}

function AdminDashboard() {
  const statsQuery = useQuery({ queryKey: ["admin", "dashboard-stats"], queryFn: getDashboardStatsApi });
  const stats = statsQuery.data;
  const loading = statsQuery.isLoading;

  const perStorePicked = stats?.perStorePicked ?? [];
  const topPerformers = perStorePicked.slice(0, 4);

  return (
    <AppShell role="admin" searchPlaceholder="Search across the network…" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Dashboard" }]}
        title="Operations Overview"
        subtitle="Network-wide fulfillment performance at a glance."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon="storefront" label="Active Dark Stores" value={loading ? "—" : String(stats?.activeStores ?? 0)} />
        <StatCard
          icon="inventory_2"
          label="SKUs in Catalog"
          value={loading ? "—" : String(stats?.skusInCatalog ?? 0)}
          tone="success"
        />
        <StatCard
          icon="local_shipping"
          label="Units Picked (24h)"
          value={loading ? "—" : (stats?.totalPickedUnits24h ?? 0).toLocaleString()}
        />
        <Link to="/admin/inventory-mapping" className="block">
          <StatCard icon="warning" label="Low Stock Alerts" value={loading ? "—" : String(stats?.lowStockAlerts ?? 0)} tone="warning" />
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-on-surface">Units picked by store</h3>
            <span className="text-xs text-on-surface-variant">Last 24h</span>
          </div>
          {loading ? (
            <p className="text-sm text-on-surface-variant py-20 text-center">Loading…</p>
          ) : perStorePicked.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-20 text-center">No stores yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perStorePicked} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--outline-variant)" />
                  <XAxis
                    dataKey="storeCode"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }}
                    width={32}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-container-low)" }} />
                  <Bar dataKey="pickedUnits" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    <LabelList
                      dataKey="pickedUnits"
                      position="top"
                      style={{ fill: "var(--on-surface)", fontSize: 11, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="text-lg font-bold text-on-surface mb-4">Top performers</h3>
          {loading ? (
            <p className="text-sm text-on-surface-variant">Loading…</p>
          ) : topPerformers.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No stores yet.</p>
          ) : (
            <ul className="space-y-3">
              {topPerformers.map((row) => (
                <li
                  key={row.storeId}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low"
                >
                  <span className="text-sm font-medium text-on-surface">{row.storeName}</span>
                  <span className="text-sm font-bold text-primary">{row.pickedUnits.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-on-surface-variant mt-3">Ranked by units picked in the last 24h.</p>
        </div>
      </div>
    </AppShell>
  );
}
