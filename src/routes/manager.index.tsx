import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import { getOrderStatsApi, listInventoryApi, listStoreOrdersApi } from "@/lib/api";
import type { OrderStatus, StaffOrder } from "@/lib/api/types";

export const Route = createFileRoute("/manager/")({
  component: ManagerDashboard,
});

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Acceptance required",
  confirmed: "Picking in progress",
  preparing: "Packing in progress",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  placed: "bg-[oklch(0.93_0.06_240)] text-[oklch(0.48_0.09_240)]",
  confirmed: "bg-[oklch(0.96_0.08_90)] text-[oklch(0.5_0.13_85)]",
  preparing: "bg-[oklch(0.96_0.08_90)] text-[oklch(0.5_0.13_85)]",
  out_for_delivery: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  delivered: "bg-surface-container-high text-on-surface-variant",
  cancelled: "bg-destructive/10 text-destructive",
};

function orderMeta(order: StaffOrder) {
  const sizeLabel =
    order.itemCount >= 15 ? "Bulk Order" : order.itemCount <= 3 ? "Express Delivery" : "Standard";
  return `${order.itemCount} item${order.itemCount === 1 ? "" : "s"} • ${sizeLabel}`;
}

function waitingMinutes(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

type WaitSeverity = "normal" | "warning" | "critical";

/** Orders awaiting acceptance need a tighter clock than orders already being worked. */
function waitSeverity(mins: number, status: OrderStatus): WaitSeverity {
  const threshold = status === "placed" ? 10 : 20;
  if (mins >= threshold * 3) return "critical";
  if (mins >= threshold) return "warning";
  return "normal";
}

const WAIT_LABEL_TONE: Record<WaitSeverity, string> = {
  normal: "text-on-surface-variant",
  warning: "text-[oklch(0.55_0.16_75)]",
  critical: "text-destructive",
};

const WAIT_VALUE_TONE: Record<WaitSeverity, string> = {
  normal: "text-on-surface",
  warning: "text-[oklch(0.55_0.16_75)]",
  critical: "text-destructive",
};

const WAIT_ICON_TONE: Record<WaitSeverity, string> = {
  normal: "bg-primary/10 text-primary",
  warning: "bg-[oklch(0.96_0.08_90)] text-[oklch(0.5_0.13_85)]",
  critical: "bg-destructive/10 text-destructive",
};

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/** Fixed text-5xl overflows the card once values grow past a few digits (e.g. large revenue figures). */
function summaryValueTextSize(value: string) {
  if (value.length > 10) return "text-2xl";
  if (value.length > 7) return "text-3xl";
  if (value.length > 5) return "text-4xl";
  return "text-5xl";
}

function ManagerDashboard() {
  const session = useSession();
  const storeId = session?.storeId;

  const statsQuery = useQuery({
    queryKey: ["order-stats", storeId],
    queryFn: () => getOrderStatsApi(storeId!),
    enabled: Boolean(storeId),
    refetchInterval: 30000,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", storeId, "active"],
    queryFn: () => listStoreOrdersApi(storeId!, "active"),
    enabled: Boolean(storeId),
    refetchInterval: 30000,
  });

  const inventoryQuery = useQuery({
    queryKey: ["inventory", storeId],
    queryFn: () => listInventoryApi(storeId!),
    enabled: Boolean(storeId),
  });

  const totalActiveOrders = ordersQuery.data?.data.length ?? 0;
  const attentionOrders = (ordersQuery.data?.data ?? []).slice(0, 3);
  const inventoryRows = inventoryQuery.data?.data ?? [];
  const lowStockRows = inventoryRows.filter((r) => r.availableQty < r.reorderThreshold);
  const criticalStock = [...lowStockRows]
    .sort((a, b) => a.availableQty - b.availableQty)
    .slice(0, 3);

  const hasSyncError = statsQuery.isError || ordersQuery.isError || inventoryQuery.isError;
  const isSyncing = statsQuery.isFetching || ordersQuery.isFetching || inventoryQuery.isFetching;

  const statsStatus = statsQuery.isError ? "error" : statsQuery.isPending ? "loading" : "ready";
  const inventoryStatus = inventoryQuery.isError
    ? "error"
    : inventoryQuery.isPending
      ? "loading"
      : "ready";

  return (
    <AppShell role="manager" searchPlaceholder="Search orders or SKU…">
      <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">
            Operations Overview
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">Real-time status for your store</p>
        </div>
        <span
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold ${
            hasSyncError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasSyncError ? "bg-destructive" : "bg-primary animate-pulse"
            }`}
          />
          {hasSyncError ? "Sync issue — retrying" : isSyncing ? "Syncing…" : "Live Store Stream"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-220 mb-6">
        <SummaryCard
          icon="shopping_bag"
          iconTone="bg-primary/10 text-primary"
          label="Total Orders Today"
          value={String(statsQuery.data?.todayCount ?? 0)}
          status={statsStatus}
          onRetry={() => statsQuery.refetch()}
        />
        <SummaryCard
          icon="payments"
          iconTone="bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]"
          label="Revenue Today"
          value={formatInr(statsQuery.data?.todayRevenue ?? 0)}
          status={statsStatus}
          onRetry={() => statsQuery.refetch()}
        />
        <SummaryCard
          icon="warning"
          iconTone="bg-destructive/10 text-destructive"
          label="Low Stock Alerts"
          value={String(lowStockRows.length)}
          badge={lowStockRows.length > 0 ? "Urgent" : undefined}
          danger={lowStockRows.length > 0}
          status={inventoryStatus}
          onRetry={() => inventoryQuery.refetch()}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.85fr)] gap-5 items-start">
        <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
            <div className="flex items-baseline gap-2">
              <h3 className="font-bold text-on-surface text-lg">Orders Needing Attention</h3>
              {totalActiveOrders > attentionOrders.length && (
                <span className="text-xs font-semibold text-on-surface-variant">
                  Showing {attentionOrders.length} of {totalActiveOrders}
                </span>
              )}
            </div>
            <Link
              to="/manager/orders"
              className="text-sm font-semibold text-primary hover:opacity-80"
            >
              View All Active
            </Link>
          </div>
          <div>
            {ordersQuery.isLoading ? (
              <p className="px-6 py-8 text-sm text-on-surface-variant">Loading…</p>
            ) : attentionOrders.length === 0 ? (
              <p className="px-6 py-8 text-sm text-on-surface-variant">
                No active orders right now.
              </p>
            ) : (
              attentionOrders.map((order, index) => {
                const mins = waitingMinutes(order.createdAt);
                const severity = waitSeverity(mins, order.status);
                return (
                  <Link
                    to="/manager/orders"
                    key={order.id}
                    className={`grid grid-cols-[auto_minmax(0,1.2fr)_minmax(120px,0.8fr)_96px_auto] items-center gap-4 px-6 py-5 hover:bg-surface-container-low transition-colors ${
                      index < attentionOrders.length - 1 ? "border-b border-outline-variant" : ""
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center ${WAIT_ICON_TONE[severity]} ${
                        severity === "critical" ? "animate-pulse" : ""
                      }`}
                    >
                      <span className="material-symbols-outlined">
                        {order.status === "placed" ? "inventory_2" : "order_approve"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[28px] leading-none font-extrabold text-on-surface tracking-tight">
                        #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-on-surface-variant mt-1">{orderMeta(order)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant mb-2">
                        Status
                      </p>
                      <span
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-semibold ${STATUS_TONE[order.status]}`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <div>
                      <p
                        className={`text-[10px] uppercase tracking-[0.18em] mb-2 ${WAIT_LABEL_TONE[severity]}`}
                      >
                        {severity === "critical" ? "SLA Breached" : "Waiting"}
                      </p>
                      <p className={`text-2xl font-bold ${WAIT_VALUE_TONE[severity]}`}>{mins}m</p>
                    </div>
                    <span className="text-on-surface-variant">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <h3 className="font-bold text-destructive text-lg">Critical Stock Alerts</h3>
          </div>
          <div className="space-y-4">
            {inventoryQuery.isLoading ? (
              <p className="text-sm text-on-surface-variant">Loading…</p>
            ) : inventoryQuery.isError ? (
              <div className="text-sm">
                <p className="text-destructive font-semibold">Couldn't load inventory.</p>
                <button
                  type="button"
                  onClick={() => inventoryQuery.refetch()}
                  className="text-primary font-semibold mt-1 hover:opacity-80"
                >
                  Retry
                </button>
              </div>
            ) : inventoryRows.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No inventory data yet.</p>
            ) : criticalStock.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                All stock levels are healthy — nothing below reorder threshold.
              </p>
            ) : (
              criticalStock.map((item) => {
                const outOfStock = item.availableQty <= 0;
                return (
                  <div
                    key={item.skuId}
                    className="rounded-2xl border border-outline-variant p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-center text-2xl">
                        <span className="material-symbols-outlined text-on-surface-variant">
                          inventory_2
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-on-surface leading-tight truncate">
                          {item.skuName}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          SKU: {item.skuId.slice(0, 8)}…
                        </p>
                        <div
                          className={`w-4 h-1 rounded-full mt-3 ${outOfStock ? "bg-destructive" : "bg-[oklch(0.75_0.16_75)]"}`}
                        />
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-3xl font-extrabold ${outOfStock ? "text-destructive" : "text-[oklch(0.55_0.16_75)]"}`}
                        >
                          {item.availableQty}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                          Units
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Link
            to="/manager/inventory"
            className="w-full mt-5 flex items-center justify-center px-5 py-3 rounded-full border border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
          >
            Manage All Inventory
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  iconTone,
  label,
  value,
  badge,
  danger = false,
  status = "ready",
  onRetry,
}: {
  icon: string;
  iconTone: string;
  label: string;
  value: string;
  badge?: string;
  danger?: boolean;
  status?: "loading" | "error" | "ready";
  onRetry?: () => void;
}) {
  return (
    <section
      className={`bg-surface p-5 rounded-[28px] shadow-sm min-h-32 min-w-0 ${
        danger && status === "ready"
          ? "border-2 border-destructive/80"
          : "border border-outline-variant"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconTone}`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        {badge && status === "ready" && (
          <span className="px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-[10px] uppercase tracking-[0.18em] font-bold">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-7 min-w-0">
        <p className="text-on-surface text-[15px]">{label}</p>
        {status === "loading" ? (
          <div className="h-11 w-24 mt-3 rounded-lg bg-surface-container-high animate-pulse" />
        ) : status === "error" ? (
          <>
            <h3 className="text-5xl font-extrabold tracking-tight mt-2 text-on-surface-variant">
              —
            </h3>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-destructive mt-1 hover:opacity-80"
            >
              Couldn't load — tap to retry
            </button>
          </>
        ) : (
          <h3
            title={value}
            className={`${summaryValueTextSize(value)} font-extrabold tracking-tight mt-2 truncate ${danger ? "text-destructive" : "text-on-surface"}`}
          >
            {value}
          </h3>
        )}
      </div>
    </section>
  );
}
