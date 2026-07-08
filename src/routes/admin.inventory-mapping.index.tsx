import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/admin/inventory-mapping/")({
  component: InventoryMapping,
});

const mappings = [
  { store: "Bandra Hub (DS02)", skus: 4210, coverage: 92, gaps: 34 },
  { store: "East London Hub (DS04)", skus: 3820, coverage: 78, gaps: 128 },
  { store: "Andheri West (DS08)", skus: 4102, coverage: 88, gaps: 62 },
  { store: "Powai (DS11)", skus: 3611, coverage: 74, gaps: 142 },
  { store: "Koregaon Park (DS14)", skus: 2910, coverage: 65, gaps: 198 },
];

function InventoryMapping() {
  return (
    <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Inventory Mapping" }]}
        title="Inventory Mapping"
        subtitle="Map SKUs to fulfillment hubs and monitor coverage gaps."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="hub" label="Total Mappings" value="742,108" delta="+3.2k" />
        <StatCard icon="check_circle" label="Avg. Coverage" value="82%" tone="success" />
        <StatCard icon="warning" label="Coverage Gaps" value="564" tone="warning" />
        <StatCard icon="update" label="Last Sync" value="2m ago" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">Bulk map SKUs</h3>
          <p className="text-sm text-on-surface-variant mb-4">
            Auto-assign SKUs to stores based on category rules or upload a CSV to override.
          </p>
          <div className="space-y-3">
            {["By Category", "By Region", "Upload CSV"].map((m) => (
              <button
                key={m}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 text-sm font-semibold"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    {m === "By Category" ? "category" : m === "By Region" ? "public" : "upload_file"}
                  </span>
                  {m}
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
            <h3 className="font-bold text-on-surface">Coverage by store</h3>
            <button className="text-xs text-primary font-semibold">View all →</button>
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
              {mappings.map((m) => (
                <tr key={m.store} className="hover:bg-surface-container-low">
                  <td className="px-6 py-4 font-medium">{m.store}</td>
                  <td className="px-6 py-4">{m.skus.toLocaleString()}</td>
                  <td className="px-6 py-4 w-48">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            m.coverage >= 85 ? "bg-[oklch(0.62_0.16_155)]" : m.coverage >= 70 ? "bg-primary" : "bg-[oklch(0.75_0.16_75)]"
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
