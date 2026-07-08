import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/manager/inventory")({
  component: Inventory,
});

const rows = [
  { sku: "SKU-1042", name: "Cold Brew Coffee 300ml", cat: "Beverages", stock: 82, par: 60, aisle: "A-14" },
  { sku: "SKU-1102", name: "Sparkling Water 500ml", cat: "Beverages", stock: 210, par: 150, aisle: "A-16" },
  { sku: "SKU-2210", name: "Oat Milk 1L", cat: "Dairy", stock: 12, par: 40, aisle: "C-03" },
  { sku: "SKU-3341", name: "Salted Chips 200g", cat: "Snacks", stock: 96, par: 120, aisle: "B-08" },
  { sku: "SKU-4408", name: "Dark Chocolate 100g", cat: "Snacks", stock: 4, par: 30, aisle: "B-11" },
  { sku: "SKU-5122", name: "Fresh Sourdough Loaf", cat: "Bakery", stock: 24, par: 20, aisle: "D-01" },
  { sku: "SKU-6031", name: "Pasta Sauce 400g", cat: "Pantry", stock: 68, par: 50, aisle: "E-04" },
];

function status(stock: number, par: number) {
  if (stock === 0) return { l: "Out", c: "bg-destructive/10 text-destructive" };
  if (stock < par * 0.3) return { l: "Critical", c: "bg-destructive/10 text-destructive" };
  if (stock < par) return { l: "Low", c: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]" };
  return { l: "Healthy", c: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]" };
}

function Inventory() {
  return (
    <AppShell role="manager" searchPlaceholder="Search inventory…">
      <PageHeader
        title="Store Inventory"
        subtitle="Live stock levels for Dark Store #402"
        actions={
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20">
            <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
            Scan intake
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="inventory_2" label="Total SKUs" value="1,842" />
        <StatCard icon="check_circle" label="Healthy" value="1,712" tone="success" />
        <StatCard icon="warning" label="Low" value="112" tone="warning" />
        <StatCard icon="error" label="Critical / Out" value="18" tone="error" />
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">SKU</th>
              <th className="px-6 py-3 text-left font-semibold">Product</th>
              <th className="px-6 py-3 text-left font-semibold">Aisle</th>
              <th className="px-6 py-3 text-left font-semibold">On Hand</th>
              <th className="px-6 py-3 text-left font-semibold">Par</th>
              <th className="px-6 py-3 text-left font-semibold">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.map((r) => {
              const st = status(r.stock, r.par);
              return (
                <tr key={r.sku} className="hover:bg-surface-container-low">
                  <td className="px-6 py-4 font-mono text-xs">{r.sku}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-on-surface-variant">{r.cat}</p>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{r.aisle}</td>
                  <td className="px-6 py-4 font-bold">{r.stock}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{r.par}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${st.c}`}>{st.l}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
