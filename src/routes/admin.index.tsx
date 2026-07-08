import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <AppShell role="admin" searchPlaceholder="Search across the network…" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Dashboard" }]}
        title="Operations Overview"
        subtitle="Network-wide fulfillment performance at a glance."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon="storefront" label="Active Dark Stores" value="42" delta="+3" />
        <StatCard icon="inventory_2" label="SKUs in Catalog" value="18,204" delta="+124" tone="success" />
        <StatCard icon="shopping_bag" label="Orders Today" value="12,860" delta="+18%" />
        <StatCard icon="warning" label="Low Stock Alerts" value="47" tone="warning" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-on-surface">Network throughput</h3>
            <span className="text-xs text-on-surface-variant">Last 24h</span>
          </div>
          <div className="h-64 flex items-end gap-2">
            {[40, 55, 48, 62, 70, 58, 72, 80, 68, 75, 84, 90, 82, 76, 88, 92, 78, 66, 60, 72, 80, 74, 68, 58].map((v, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/70 to-primary" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="text-lg font-bold text-on-surface mb-4">Top performers</h3>
          <ul className="space-y-3">
            {[
              { name: "Bandra Hub – DS02", orders: 1284 },
              { name: "Andheri West – DS08", orders: 1122 },
              { name: "Powai – DS11", orders: 986 },
              { name: "Koregaon Park – DS14", orders: 872 },
            ].map((s) => (
              <li key={s.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low">
                <span className="text-sm font-medium text-on-surface">{s.name}</span>
                <span className="text-sm font-bold text-primary">{s.orders.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
