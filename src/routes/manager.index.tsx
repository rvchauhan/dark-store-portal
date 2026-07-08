import { createFileRoute } from "@tanstack/react-router";
import { AppShell, StatCard } from "@/components/AppShell";

export const Route = createFileRoute("/manager/")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  return (
    <AppShell role="manager" searchPlaceholder="Search orders or SKU…" primaryAction={{ label: "Add New Order", icon: "add", to: "/manager/orders" }}>
      <div className="flex justify-between items-end mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Operations Overview</h2>
          <p className="text-sm text-on-surface-variant mt-1">Real-time status for store session 042-A</p>
        </div>
        <span className="flex items-center gap-2 px-4 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-bold">
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          Live Store Stream
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon="shopping_bag" label="Total Orders Today" value="1,284" delta="+12%" />
        <StatCard icon="check_circle" label="Fulfilled" value="1,201" tone="success" delta="+8%" />
        <StatCard icon="pending" label="In Progress" value="42" />
        <StatCard icon="warning" label="Low Stock SKUs" value="18" tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-on-surface">Orders per hour</h3>
            <span className="text-xs text-on-surface-variant">Since 06:00</span>
          </div>
          <div className="h-64 flex items-end gap-2">
            {[20, 32, 40, 55, 68, 76, 82, 90, 78, 65, 58, 72, 88, 94, 82, 70, 62, 48].map((v, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/70 to-primary" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">Rider status</h3>
          <ul className="space-y-3">
            {[
              { name: "Priya S.", status: "In transit", tone: "text-primary" },
              { name: "Rahul K.", status: "Returning", tone: "text-[oklch(0.5_0.16_75)]" },
              { name: "Ayesha N.", status: "Idle", tone: "text-on-surface-variant" },
              { name: "Vikram P.", status: "In transit", tone: "text-primary" },
            ].map((r) => (
              <li key={r.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary text-xs font-bold">
                    {r.name.split(" ").map((s) => s[0]).join("")}
                  </div>
                  <span className="text-sm font-medium">{r.name}</span>
                </div>
                <span className={`text-xs font-semibold ${r.tone}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
