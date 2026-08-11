import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import {
  getStoreOrderApi,
  inventoryMovementApi,
  listStoreOrdersApi,
  updateOrderStatusApi,
} from "@/lib/api";
import { ApiError, type OrderStatus, type StaffOrder, type StaffOrderItem } from "@/lib/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

export const Route = createFileRoute("/manager/orders")({
  component: Orders,
});

const STAGE_LABEL: Record<OrderStatus, string> = {
  placed: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STAGE_WIDTH: Record<OrderStatus, string> = {
  placed: "15%",
  confirmed: "35%",
  preparing: "70%",
  out_for_delivery: "90%",
  delivered: "100%",
  cancelled: "100%",
};

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  placed: { label: "Accept Order", next: "confirmed" },
  confirmed: { label: "Start Preparation", next: "preparing" },
  preparing: { label: "Mark Ready", next: "out_for_delivery" },
  out_for_delivery: { label: "Mark Delivered", next: "delivered" },
};

/** Statuses the manager portal still lets a store reject/cancel from (mirrors ALLOWED_TRANSITIONS on the API). */
const REJECTABLE_STATUSES = new Set<OrderStatus>(["placed", "confirmed", "preparing"]);

/** Packing checklist driven by what's actually in the order, not a fixed list shown for every order. */
function checklistFor(items: StaffOrderItem[]) {
  const checklist: { title: string; note: string }[] = [];
  if (items.some((item) => item.requiresColdStorage)) {
    checklist.push({
      title: "Cold chain bag used",
      note: "Order contains items requiring cold storage",
    });
  }
  if (items.some((item) => item.isFragile)) {
    checklist.push({
      title: "Fragile items secured",
      note: "Order contains fragile items — bubble wrap required",
    });
  }
  const totalWeightKg = items.reduce(
    (sum, item) => sum + (item.weightKg ? Number(item.weightKg) * item.quantity : 0),
    0,
  );
  if (totalWeightKg > 3) {
    checklist.push({
      title: "Bag handle reinforced",
      note: `Heavy order detected (${totalWeightKg.toFixed(1)}kg)`,
    });
  }
  checklist.push({ title: "Order receipt included", note: "Physical copy or QR tag" });
  return checklist;
}

/** Deterministic cosmetic aisle/bin per SKU — no bin-location data exists in the schema yet. */
function locationFor(skuId: string): string[] {
  let hash = 0;
  for (let i = 0; i < skuId.length; i++) hash = (hash * 31 + skuId.charCodeAt(i)) >>> 0;
  const aisle = String((hash % 12) + 1).padStart(2, "0");
  const bin = String.fromCharCode(65 + (hash % 4)) + "-" + (((hash >> 4) % 30) + 1);
  const zone = ["Cold", "Fresh", "Ambient", "Chilled"][hash % 4];
  return [`Aisle ${aisle}`, `Bin ${bin}`, zone];
}

function Orders() {
  const session = useSession();
  const storeId = session?.storeId;
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<StaffOrderItem | null>(null);
  const [reportMissingOpen, setReportMissingOpen] = useState(false);
  const [trackingName, setTrackingName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["orders", storeId, "active"],
    queryFn: () => listStoreOrdersApi(storeId!, "active"),
    enabled: Boolean(storeId),
    refetchInterval: 30000,
  });

  const activeOrders = ordersQuery.data?.data ?? [];

  useEffect(() => {
    if (!selectedOrderId && ordersQuery.data && ordersQuery.data.data.length > 0) {
      setSelectedOrderId(ordersQuery.data.data[0].id);
    }
  }, [selectedOrderId, ordersQuery.data]);

  const orderDetailQuery = useQuery({
    queryKey: ["order", storeId, selectedOrderId],
    queryFn: () => getStoreOrderApi(storeId!, selectedOrderId!),
    enabled: Boolean(storeId && selectedOrderId),
  });

  const detail = orderDetailQuery.data;
  const nextAction = detail ? NEXT_ACTION[detail.order.status] : undefined;

  // Tracking fields carry over from the order once assigned; reset for a fresh order.
  useEffect(() => {
    setTrackingName(detail?.order.trackingName ?? "");
    setTrackingNumber(detail?.order.trackingNumber ?? "");
    setTrackingUrl(detail?.order.trackingUrl ?? "");
  }, [detail?.order.id, detail?.order.trackingName, detail?.order.trackingNumber, detail?.order.trackingUrl]);

  const items = detail?.items ?? [];
  const trackingAssigned = Boolean(
    trackingName.trim() && trackingNumber.trim() && trackingUrl.trim(),
  );

  const blockedReason = (() => {
    if (!detail || !nextAction) return null;
    if (detail.order.status === "preparing") {
      if (!trackingAssigned) return "Fill tracking name, number, and URL before marking ready.";
    }
    return null;
  })();

  const advanceStatus = useMutation({
    mutationFn: (status: OrderStatus) =>
      updateOrderStatusApi(
        storeId!,
        selectedOrderId!,
        status,
        status === "out_for_delivery"
          ? {
              trackingName: trackingName.trim(),
              trackingNumber: trackingNumber.trim(),
              trackingUrl: trackingUrl.trim(),
            }
          : undefined,
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["orders", storeId] });
      queryClient.invalidateQueries({ queryKey: ["order-stats", storeId] });
      queryClient.invalidateQueries({ queryKey: ["order", storeId, selectedOrderId] });
      // Order left the active queue — move on to the next one waiting instead
      // of leaving the manager staring at a completed order.
      if (updated.status === "delivered" || updated.status === "cancelled") {
        const remaining = activeOrders.filter((o) => o.id !== selectedOrderId);
        setSelectedOrderId(remaining[0]?.id ?? null);
      }
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update order status")),
  });

  return (
    <AppShell
      role="manager"
      shellTitle="Order Fulfillment"
      searchPlaceholder="Search orders, items, bins..."
    >
      <div className="grid grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_300px] gap-5 items-start">
        <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm p-5 min-h-190">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-3xl font-bold tracking-tight text-on-surface">Active Orders</h2>
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {activeOrders.length} Queue
            </span>
          </div>

          <div className="space-y-4">
            {ordersQuery.isLoading ? (
              <p className="text-sm text-on-surface-variant">Loading…</p>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No active orders right now.</p>
            ) : (
              activeOrders.map((order: StaffOrder) => {
                const active = order.id === selectedOrderId;
                const done = order.status === "delivered";
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full text-left rounded-2xl p-4 border shadow-sm cursor-pointer transition-colors ${
                      active
                        ? "border-primary shadow-primary/10"
                        : "border-outline-variant hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-on-surface">#{order.id.slice(0, 8)}</p>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-bold ${
                          order.status === "confirmed"
                            ? "bg-[oklch(0.9_0.08_95)] text-[oklch(0.5_0.13_85)]"
                            : order.status === "preparing"
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        {STAGE_LABEL[order.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-sm text-on-surface-variant">
                      <span
                        className={`material-symbols-outlined text-[16px] ${done ? "text-primary/50" : "text-destructive"}`}
                      >
                        schedule
                      </span>
                      <span
                        className={
                          done ? "text-on-surface-variant" : "text-destructive font-semibold"
                        }
                      >
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className={`h-full rounded-full ${done ? "bg-primary/40" : "bg-primary"}`}
                        style={{ width: STAGE_WIDTH[order.status] }}
                      />
                    </div>
                    <p
                      className={`mt-3 text-sm ${active ? "text-primary font-semibold" : "text-on-surface-variant"}`}
                    >
                      {order.itemCount} items • {order.customerName}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm overflow-hidden min-h-190">
          {!detail ? (
            <p className="p-6 text-sm text-on-surface-variant">
              {orderDetailQuery.isLoading ? "Loading order…" : "Select an order from the queue."}
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-outline-variant">
                <div>
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-2">
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                      Order #{detail.order.id.slice(0, 8)}
                    </span>
                    <span>• Customer: {detail.order.customerName}</span>
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-on-surface">
                    Picking List ({detail.items.length} Items)
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setReportMissingOpen(true)}
                    className="px-4 py-3 rounded-2xl border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-container-low"
                  >
                    Report Missing
                  </button>
                  {REJECTABLE_STATUSES.has(detail.order.status) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={advanceStatus.isPending}
                          className="px-4 py-3 rounded-2xl border border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Reject Order
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Reject order #{detail.order.id.slice(0, 8)}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This cancels the order for {detail.order.customerName} and cannot be
                            undone. The customer will be notified.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Order</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => advanceStatus.mutate("cancelled")}
                          >
                            Reject Order
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {nextAction && (
                    <button
                      type="button"
                      disabled={advanceStatus.isPending || Boolean(blockedReason)}
                      title={blockedReason ?? undefined}
                      onClick={() => advanceStatus.mutate(nextAction.next)}
                      className="px-5 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
                    >
                      {nextAction.label}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1.4fr)_170px_70px] px-6 py-4 bg-surface-container-low text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold">
                <div>Item Details</div>
                <div>Location</div>
                <div>Qty</div>
              </div>

              <div>
                {detail.items.map((item: StaffOrderItem, index: number) => {
                  const location = locationFor(item.skuId);
                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[minmax(0,1.4fr)_170px_70px] items-center gap-4 px-6 py-5 ${
                        index < detail.items.length - 1 ? "border-b border-outline-variant" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="flex items-center gap-4 text-left cursor-pointer group"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-surface-container-low border border-outline-variant flex items-center justify-center text-xl text-on-surface-variant shrink-0 overflow-hidden">
                          {item.images?.[0] ? (
                            <img
                              src={item.images[0]}
                              alt={item.nameSnapshot}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined">inventory_2</span>
                          )}
                        </div>
                        <div>
                          <p className="text-2xl font-bold leading-tight text-on-surface group-hover:underline">
                            {item.nameSnapshot}
                          </p>
                          <p className="text-sm text-on-surface-variant mt-1">
                            Qty {item.quantity} · ₹{item.unitPrice}
                            {item.brand ? ` · ${item.brand}` : ""}
                          </p>
                          {(item.isFragile || item.requiresColdStorage) && (
                            <div className="flex items-center gap-2 mt-2">
                              {item.requiresColdStorage && (
                                <span className="px-2 py-0.5 rounded-full bg-[oklch(0.92_0.06_230)] text-[oklch(0.45_0.1_230)] text-[10px] font-bold uppercase tracking-wide">
                                  Cold Chain
                                </span>
                              )}
                              {item.isFragile && (
                                <span className="px-2 py-0.5 rounded-full bg-[oklch(0.92_0.08_60)] text-[oklch(0.45_0.12_60)] text-[10px] font-bold uppercase tracking-wide">
                                  Fragile
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                      <div className="text-sm font-semibold uppercase leading-tight text-primary">
                        {location.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                      <div className="text-3xl font-bold text-on-surface">{item.quantity}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <div className="space-y-5">
          {detail && (
            <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm p-5">
              <h2 className="text-3xl font-bold tracking-tight text-on-surface">Order Details</h2>
              <p className="text-sm text-on-surface-variant mt-2">
                {`Order #${detail.order.id.slice(0, 8)} • ${detail.order.customerName}`}
              </p>

              <div className="mt-8 space-y-6">
                <div className="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
                  <h3 className="text-sm uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-3">
                    Delivery Address
                  </h3>
                  <p className="text-sm text-on-surface font-semibold">{detail.order.customerName}</p>
                  <p className="text-sm text-on-surface-variant mt-2">
                    {detail.order.deliveryAddress.line1}
                    {detail.order.deliveryAddress.line2 ? `, ${detail.order.deliveryAddress.line2}` : ""}
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {detail.order.deliveryAddress.city}, {detail.order.deliveryAddress.postalCode}
                  </p>
                  <p className="text-sm text-on-surface-variant mt-2">
                    {detail.order.deliveryAddress.phone}
                  </p>
                </div>

                <div className="rounded-3xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
                  <h3 className="text-sm uppercase tracking-[0.16em] text-on-surface-variant font-semibold">
                    Tracking Details
                  </h3>
                  {detail.order.status === "preparing" ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                        Tracking service name
                      </label>
                      <input
                        type="text"
                        value={trackingName}
                        onChange={(e) => setTrackingName(e.target.value)}
                        placeholder="e.g. Delhivery, XpressBee"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                        Tracking number
                      </label>
                      <input
                        type="text"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Enter tracking number"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                        Tracking URL
                      </label>
                      <input
                        type="url"
                        value={trackingUrl}
                        onChange={(e) => setTrackingUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-on-surface">
                    {detail.order.trackingName && (
                      <p>
                        <span className="font-semibold">Tracking:</span> {detail.order.trackingName}
                      </p>
                    )}
                    {detail.order.trackingNumber && (
                      <p>
                        <span className="font-semibold">Tracking ID:</span> {detail.order.trackingNumber}
                      </p>
                    )}
                    {detail.order.trackingUrl && (
                      <p>
                        <span className="font-semibold">Tracking link:</span>{" "}
                        <a
                          href={detail.order.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          View status
                        </a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {nextAction && detail && (
              <>
                <button
                  type="button"
                  disabled={advanceStatus.isPending || Boolean(blockedReason)}
                  onClick={() => advanceStatus.mutate(nextAction.next)}
                  className="w-full mt-8 flex items-center justify-center gap-3 px-6 py-5 rounded-full bg-primary text-primary-foreground text-xl font-semibold shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">local_shipping</span>
                  {nextAction.label}
                </button>
                {blockedReason && (
                  <p className="text-xs text-destructive text-center mt-3">{blockedReason}</p>
                )}
              </>
            )}
          </section>
        )}
        </div>
      </div>

      <ReportMissingDialog
        open={reportMissingOpen}
        storeId={storeId ?? null}
        orderId={selectedOrderId}
        items={items}
        onClose={() => setReportMissingOpen(false)}
        onReported={() => {
          queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });
        }}
      />

      <Sheet open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <SheetContent>
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle>{detailItem.nameSnapshot}</SheetTitle>
                <SheetDescription>
                  {[detailItem.brand, detailItem.category].filter(Boolean).join(" · ") ||
                    "Product details"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="w-full aspect-square rounded-2xl bg-surface-container-low border border-outline-variant flex items-center justify-center overflow-hidden">
                  {detailItem.images?.[0] ? (
                    <img
                      src={detailItem.images[0]}
                      alt={detailItem.nameSnapshot}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-5xl text-on-surface-variant">
                      inventory_2
                    </span>
                  )}
                </div>

                {(detailItem.isFragile || detailItem.requiresColdStorage) && (
                  <div className="flex items-center gap-2">
                    {detailItem.requiresColdStorage && (
                      <span className="px-2.5 py-1 rounded-full bg-[oklch(0.92_0.06_230)] text-[oklch(0.45_0.1_230)] text-[10px] font-bold uppercase tracking-wide">
                        Cold Chain
                      </span>
                    )}
                    {detailItem.isFragile && (
                      <span className="px-2.5 py-1 rounded-full bg-[oklch(0.92_0.08_60)] text-[oklch(0.45_0.12_60)] text-[10px] font-bold uppercase tracking-wide">
                        Fragile
                      </span>
                    )}
                  </div>
                )}

                {detailItem.description && (
                  <p className="text-sm text-on-surface-variant">{detailItem.description}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                      Qty · Price
                    </dt>
                    <dd className="font-semibold text-on-surface">
                      {detailItem.quantity} · ₹{detailItem.unitPrice}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                      Line Total
                    </dt>
                    <dd className="font-semibold text-on-surface">₹{detailItem.lineTotal}</dd>
                  </div>
                  {detailItem.weightKg && (
                    <div>
                      <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                        Weight
                      </dt>
                      <dd className="font-semibold text-on-surface">{detailItem.weightKg} kg</dd>
                    </div>
                  )}
                  {detailItem.dimensionsCm && (
                    <div>
                      <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                        Dimensions
                      </dt>
                      <dd className="font-semibold text-on-surface">
                        {detailItem.dimensionsCm.length} × {detailItem.dimensionsCm.width} ×{" "}
                        {detailItem.dimensionsCm.height} cm
                      </dd>
                    </div>
                  )}
                  {detailItem.skuCode && (
                    <div>
                      <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                        SKU Code
                      </dt>
                      <dd className="font-semibold text-on-surface">{detailItem.skuCode}</dd>
                    </div>
                  )}
                  {detailItem.barcode && (
                    <div>
                      <dt className="text-on-surface-variant text-xs uppercase tracking-wide">
                        Barcode
                      </dt>
                      <dd className="font-semibold text-on-surface">{detailItem.barcode}</dd>
                    </div>
                  )}
                </dl>

                {detailItem.specs && detailItem.specs.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-on-surface-variant mb-2">
                      Specifications
                    </p>
                    <dl className="rounded-xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
                      {detailItem.specs.map((spec) => (
                        <div key={spec.key} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                          <dt className="text-on-surface-variant">{spec.key}</dt>
                          <dd className="font-semibold text-on-surface text-right">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function ReportMissingDialog({
  open,
  storeId,
  orderId,
  items,
  onClose,
  onReported,
}: {
  open: boolean;
  storeId: string | null;
  orderId: string | null;
  items: StaffOrderItem[];
  onClose: () => void;
  onReported: (skuIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const reset = () => {
    setSelected(new Set());
    setNote("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const targets = items.filter((item) => selected.has(item.skuId));
      const shortId = orderId?.slice(0, 8) ?? "unknown";
      await Promise.all(
        targets.map((item) =>
          inventoryMovementApi(storeId!, {
            skuId: item.skuId,
            type: "damage",
            quantity: item.quantity,
            source: `Order #${shortId} reported missing${note ? `: ${note}` : ""}`,
          }),
        ),
      );
      return targets.map((t) => t.skuId);
    },
    onSuccess: (skuIds) => {
      toast.success(`Reported ${skuIds.length} item${skuIds.length === 1 ? "" : "s"} missing`);
      onReported(skuIds);
      reset();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to report missing items")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Missing Items</DialogTitle>
          <DialogDescription>
            Select the items that couldn't be found. This deducts them from inventory as
            damage/loss.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-outline-variant px-4 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(item.skuId)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.skuId)) next.delete(item.skuId);
                    else next.add(item.skuId);
                    return next;
                  })
                }
                className="w-5 h-5 rounded border-outline-variant text-primary"
              />
              <span className="text-sm font-semibold text-on-surface">
                {item.nameSnapshot}{" "}
                <span className="text-on-surface-variant">× {item.quantity}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. damaged in transit, not found on shelf"
            className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        <DialogFooter className="mt-2">
          <button
            type="button"
            disabled={selected.size === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full flex items-center justify-center gap-2 bg-destructive text-destructive-foreground px-5 py-3 rounded-full text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? "Reporting…" : `Report ${selected.size || ""} Missing`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
