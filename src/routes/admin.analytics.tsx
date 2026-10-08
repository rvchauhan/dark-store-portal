import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { getAnalyticsOverviewApi } from "@/lib/api";
import type { OrderStatus, SkuSalesStat } from "@/lib/api/types";

export const Route = createFileRoute("/admin/analytics")({
  component: Analytics,
});

const STATUS_ORDER: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "fulfilled",
  "cancelled",
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

/** Status color is reserved for the two terminal states — the rest are just in-flight stages, not "good/bad". */
const STATUS_BAR_CLASS: Record<OrderStatus, string> = {
  placed: "bg-on-surface-variant/40",
  confirmed: "bg-on-surface-variant/40",
  preparing: "bg-on-surface-variant/40",
  out_for_delivery: "bg-on-surface-variant/40",
  fulfilled: "bg-[oklch(0.62_0.16_155)]",
  cancelled: "bg-destructive",
};

function formatDay(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const compactNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

function TrendTooltip({
  active,
  payload,
  label,
  valuePrefix,
  valueSuffix,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-outline-variant rounded-xl px-3 py-2 shadow-md">
      <p className="text-sm font-bold text-on-surface">
        {valuePrefix}
        {payload[0].value.toLocaleString()}
        {valueSuffix}
      </p>
      <p className="text-xs text-on-surface-variant">{label ? formatDay(label) : ""}</p>
    </div>
  );
}

function SkuList({ title, rows, emptyHint }: { title: string; rows: SkuSalesStat[]; emptyHint: string }) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
      <h3 className="text-lg font-bold text-on-surface mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{emptyHint}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.skuId} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-low">
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{r.name}</p>
                <p className="text-xs text-on-surface-variant">{r.unitsSold.toLocaleString()} units sold</p>
              </div>
              <span className="text-sm font-bold text-primary shrink-0 ml-3">₹{r.revenue.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Analytics() {
  const query = useQuery({ queryKey: ["admin", "analytics", "overview"], queryFn: getAnalyticsOverviewApi });
  const data = query.data;
  const loading = query.isLoading;

  const totalRevenue = data?.revenueTrend.reduce((sum, r) => sum + r.revenue, 0) ?? 0;
  const totalOrders = data?.statusBreakdown.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const cancelledCount = data?.statusBreakdown.find((r) => r.status === "cancelled")?.count ?? 0;
  const cancelRate = totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0;
  const maxStatusCount = Math.max(1, ...(data?.statusBreakdown.map((r) => r.count) ?? [1]));
  const statusByKey = new Map((data?.statusBreakdown ?? []).map((r) => [r.status, r.count]));

  return (
    <AppShell role="admin">
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Analytics" }]}
        title="Analytics"
        subtitle={`Network-wide sales and fulfillment trends — last ${data?.windowDays ?? 30} days.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon="payments" label="Revenue (30d)" value={loading ? "—" : `₹${totalRevenue.toLocaleString()}`} tone="success" />
        <StatCard icon="receipt_long" label="Orders (30d)" value={loading ? "—" : String(totalOrders)} />
        <StatCard
          icon="schedule"
          label="Avg. Fulfillment Time"
          value={
            loading
              ? "—"
              : data?.avgFulfillmentMinutes == null
                ? "—"
                : data.avgFulfillmentMinutes >= 60
                  ? `${(data.avgFulfillmentMinutes / 60).toFixed(1)}h`
                  : `${data.avgFulfillmentMinutes}m`
          }
        />
        <StatCard icon="cancel" label="Cancellation Rate" value={loading ? "—" : `${cancelRate}%`} tone={cancelRate > 10 ? "warning" : "primary"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-on-surface">Revenue</h3>
            <span className="text-xs text-on-surface-variant">Last 14 days</span>
          </div>
          {loading ? (
            <p className="text-sm text-on-surface-variant py-16 text-center">Loading…</p>
          ) : (data?.revenueTrend.length ?? 0) === 0 ? (
            <p className="text-sm text-on-surface-variant py-16 text-center">No orders in this window.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--outline-variant)" />
                  <XAxis dataKey="day" tickFormatter={formatDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }} />
                  <YAxis
                    tickFormatter={(v) => compactNumber.format(v)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }}
                    width={48}
                  />
                  <Tooltip content={<TrendTooltip valuePrefix="₹" />} cursor={{ stroke: "var(--outline-variant)" }} />
                  <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-on-surface">Units sold</h3>
            <span className="text-xs text-on-surface-variant">Last 14 days</span>
          </div>
          {loading ? (
            <p className="text-sm text-on-surface-variant py-16 text-center">Loading…</p>
          ) : (data?.unitsTrend.length ?? 0) === 0 ? (
            <p className="text-sm text-on-surface-variant py-16 text-center">No sales in this window.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.unitsTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--outline-variant)" />
                  <XAxis dataKey="day" tickFormatter={formatDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }} width={32} />
                  <Tooltip content={<TrendTooltip valueSuffix=" units" />} cursor={{ stroke: "var(--outline-variant)" }} />
                  <Line type="monotone" dataKey="units" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SkuList title="Top sellers" rows={data?.topSkus ?? []} emptyHint="No sales in this window yet." />
        <SkuList
          title="Slow movers"
          rows={data?.slowMovers ?? []}
          emptyHint="Not enough distinct sold SKUs yet to single out slow movers."
        />
        <div className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm">
          <h3 className="text-lg font-bold text-on-surface mb-4">Order status (30d)</h3>
          {loading ? (
            <p className="text-sm text-on-surface-variant">Loading…</p>
          ) : totalOrders === 0 ? (
            <p className="text-sm text-on-surface-variant">No orders in this window.</p>
          ) : (
            <ul className="space-y-3">
              {STATUS_ORDER.map((status) => {
                const value = statusByKey.get(status) ?? 0;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-on-surface-variant">{STATUS_LABEL[status]}</span>
                      <span className="font-semibold text-on-surface">{value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className={`h-full rounded-full ${STATUS_BAR_CLASS[status]}`}
                        style={{ width: `${(value / maxStatusCount) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
