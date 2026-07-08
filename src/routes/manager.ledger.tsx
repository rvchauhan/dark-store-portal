import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/manager/ledger")({
  component: Ledger,
});

const entries = [
  { time: "14:32", type: "Sale", sku: "SKU-1042", name: "Cold Brew 300ml", qty: -1, by: "Order #A2091", bal: 82 },
  { time: "14:28", type: "Intake", sku: "SKU-2210", name: "Oat Milk 1L", qty: +48, by: "Priya S.", bal: 60 },
  { time: "13:55", type: "Sale", sku: "SKU-3341", name: "Salted Chips 200g", qty: -2, by: "Order #A2090", bal: 96 },
  { time: "13:44", type: "Adjustment", sku: "SKU-4408", name: "Dark Chocolate 100g", qty: -3, by: "Damage report", bal: 4 },
  { time: "13:12", type: "Intake", sku: "SKU-5122", name: "Fresh Sourdough Loaf", qty: +20, by: "Rahul K.", bal: 24 },
  { time: "12:40", type: "Sale", sku: "SKU-1102", name: "Sparkling Water 500ml", qty: -6, by: "Order #A2087", bal: 210 },
  { time: "12:22", type: "Return", sku: "SKU-6031", name: "Pasta Sauce 400g", qty: +1, by: "Order #A2081", bal: 68 },
];

const typeStyles: Record<string, string> = {
  Sale: "bg-primary/10 text-primary",
  Intake: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  Return: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
  Adjustment: "bg-destructive/10 text-destructive",
};

function Ledger() {
  return (
    <AppShell role="manager" searchPlaceholder="Search ledger…">
      <PageHeader
        title="Inventory Ledger"
        subtitle="Every movement of stock in and out of the store"
        actions={
          <>
            <button className="flex items-center gap-2 bg-surface border border-outline-variant px-5 py-2 rounded-full text-sm hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Today
            </button>
            <button className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-md shadow-primary/20">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export CSV
            </button>
          </>
        }
      />

      <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex gap-2 p-4 border-b border-outline-variant">
          {["All", "Sale", "Intake", "Return", "Adjustment"].map((t, i) => (
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
        <table className="w-full text-sm">
          <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Time</th>
              <th className="px-6 py-3 text-left font-semibold">Type</th>
              <th className="px-6 py-3 text-left font-semibold">Product</th>
              <th className="px-6 py-3 text-left font-semibold">Qty</th>
              <th className="px-6 py-3 text-left font-semibold">Source</th>
              <th className="px-6 py-3 text-left font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {entries.map((e, i) => (
              <tr key={i} className="hover:bg-surface-container-low">
                <td className="px-6 py-4 font-mono text-xs">{e.time}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${typeStyles[e.type]}`}>
                    {e.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-on-surface-variant font-mono">{e.sku}</p>
                </td>
                <td className={`px-6 py-4 font-bold ${e.qty > 0 ? "text-[oklch(0.4_0.16_155)]" : "text-destructive"}`}>
                  {e.qty > 0 ? `+${e.qty}` : e.qty}
                </td>
                <td className="px-6 py-4 text-on-surface-variant">{e.by}</td>
                <td className="px-6 py-4 font-semibold">{e.bal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
