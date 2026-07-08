import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/admin/master-catalog/")({
  component: MasterCatalog,
});

const products = [
  { sku: "SKU-1042", name: "Cold Brew Coffee 300ml", cat: "Beverages", price: "£3.20", stores: 32, status: "Live" },
  { sku: "SKU-1102", name: "Sparkling Water 500ml", cat: "Beverages", price: "£1.10", stores: 41, status: "Live" },
  { sku: "SKU-2210", name: "Oat Milk 1L", cat: "Dairy", price: "£2.40", stores: 40, status: "Live" },
  { sku: "SKU-3341", name: "Salted Chips 200g", cat: "Snacks", price: "£1.80", stores: 42, status: "Live" },
  { sku: "SKU-4408", name: "Dark Chocolate 100g", cat: "Snacks", price: "£2.60", stores: 24, status: "Draft" },
  { sku: "SKU-5122", name: "Fresh Sourdough Loaf", cat: "Bakery", price: "£3.90", stores: 18, status: "Live" },
  { sku: "SKU-6031", name: "Pasta Sauce 400g", cat: "Pantry", price: "£2.10", stores: 36, status: "Live" },
];

function MasterCatalog() {
  return (
    <AppShell role="admin" searchPlaceholder="Search Master Catalog…" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Catalog Management" }, { label: "Master Catalog" }]}
        title="Global Inventory List"
        subtitle="Manage and monitor all stock keeping units across the entire ecosystem."
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="inventory_2" label="Total SKUs" value="18,204" delta="+124" />
        <StatCard icon="check_circle" label="Live" value="17,892" tone="success" />
        <StatCard icon="edit_note" label="Draft" value="284" />
        <StatCard icon="block" label="Archived" value="28" tone="warning" />
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant flex-wrap gap-4">
          <div className="flex gap-2">
            {["All", "Beverages", "Snacks", "Dairy", "Bakery", "Pantry"].map((t, i) => (
              <button
                key={t}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-full border border-outline-variant text-xs hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">tune</span> Filter
            </button>
            <button className="px-4 py-2 rounded-full border border-outline-variant text-xs hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">download</span> Export
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
              <th className="px-6 py-3 font-semibold">SKU</th>
              <th className="px-6 py-3 font-semibold">Product</th>
              <th className="px-6 py-3 font-semibold">Category</th>
              <th className="px-6 py-3 font-semibold">List Price</th>
              <th className="px-6 py-3 font-semibold">Stores</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {products.map((p) => (
              <tr key={p.sku} className="hover:bg-surface-container-low">
                <td className="px-6 py-4 font-mono text-xs">{p.sku}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                    </div>
                    <span className="font-medium text-on-surface">{p.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-on-surface-variant">{p.cat}</td>
                <td className="px-6 py-4 font-semibold">{p.price}</td>
                <td className="px-6 py-4">{p.stores}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                      p.status === "Live"
                        ? "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {p.status}
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
