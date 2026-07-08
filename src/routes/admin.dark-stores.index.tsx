import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/admin/dark-stores/")({
  component: DarkStores,
});

const stores = [
  { id: "DS02", name: "Bandra Hub", city: "Mumbai", skus: 4210, fill: 92, status: "Active" },
  { id: "DS04", name: "East London Hub", city: "London", skus: 3820, fill: 78, status: "Onboarding" },
  { id: "DS08", name: "Andheri West", city: "Mumbai", skus: 4102, fill: 88, status: "Active" },
  { id: "DS11", name: "Powai", city: "Mumbai", skus: 3611, fill: 74, status: "Active" },
  { id: "DS14", name: "Koregaon Park", city: "Pune", skus: 2910, fill: 65, status: "Active" },
  { id: "DS17", name: "HSR Layout", city: "Bengaluru", skus: 3402, fill: 81, status: "Active" },
  { id: "DS20", name: "Salt Lake", city: "Kolkata", skus: 2140, fill: 42, status: "Paused" },
];

const statusStyles: Record<string, string> = {
  Active: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  Onboarding: "bg-primary/10 text-primary",
  Paused: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
};

function DarkStores() {
  return (
    <AppShell role="admin" searchPlaceholder="Search by Store Name or ID…" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Dark Stores" }]}
        title="Dark Store Network"
        subtitle="42 active fulfillment hubs across 8 regions"
        actions={
          <>
            <button className="flex items-center gap-2 bg-surface border border-outline-variant px-5 py-2 rounded-full text-sm hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Status: All
            </button>
            <Link
              to="/admin/dark-stores/new"
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">add_business</span>
              Add Dark Store
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="storefront" label="Total Stores" value="42" delta="+3" />
        <StatCard icon="check_circle" label="Active" value="38" tone="success" />
        <StatCard icon="hourglass_top" label="Onboarding" value="3" />
        <StatCard icon="pause_circle" label="Paused" value="1" tone="warning" />
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
          <h3 className="font-bold text-on-surface">Store directory</h3>
          <div className="flex gap-2">
            <button className="p-2 rounded-full hover:bg-surface-container-low text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">download</span>
            </button>
            <button className="p-2 rounded-full hover:bg-surface-container-low text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
              <th className="px-6 py-3 font-semibold">Store</th>
              <th className="px-6 py-3 font-semibold">City</th>
              <th className="px-6 py-3 font-semibold">SKUs</th>
              <th className="px-6 py-3 font-semibold">Fill Rate</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {stores.map((s) => (
              <tr key={s.id} className="hover:bg-surface-container-low">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold text-xs">
                      {s.id}
                    </div>
                    <div>
                      <p className="font-semibold text-on-surface">{s.name}</p>
                      <p className="text-xs text-on-surface-variant">#{s.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-on-surface-variant">{s.city}</td>
                <td className="px-6 py-4 font-medium">{s.skus.toLocaleString()}</td>
                <td className="px-6 py-4 w-48">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${s.fill}%` }} />
                    </div>
                    <span className="text-xs font-semibold w-8">{s.fill}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusStyles[s.status]}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
