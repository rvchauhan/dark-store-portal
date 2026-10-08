import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import {
  getSkuApi,
  inventoryMovementApi,
  listInventoryApi,
  stockInApi,
  updateSkuMappingApi,
} from "@/lib/api";
import { ApiError, type InventoryRow } from "@/lib/api/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/manager/inventory")({
  component: Inventory,
});

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

function stockStatus(qty: number, threshold: number) {
  if (qty <= 0) {
    return { label: "Out of Stock", className: "bg-destructive/10 text-destructive" };
  }
  if (qty < threshold) {
    return {
      label: "Low Stock",
      className: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
    };
  }
  return {
    label: "In Stock",
    className: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  };
}

type StockFilter = "all" | "healthy" | "low" | "out";

const MOVEMENT_TYPES = ["stock_in", "damage", "return", "adjustment", "correction"] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const MOVEMENT_LABEL: Record<MovementType, string> = {
  stock_in: "Stock In (replenish)",
  damage: "Damage",
  return: "Return",
  adjustment: "Adjustment (+/-)",
  correction: "Correction (+/-)",
};

/** adjustment/correction can move either direction — everything else is always positive. */
const SIGNED_TYPES = new Set<MovementType>(["adjustment", "correction"]);

function Inventory() {
  const session = useSession();
  const storeId = session?.storeId;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StockFilter>("all");
  const [movementRow, setMovementRow] = useState<InventoryRow | null>(null);
  const [selectedRow, setSelectedRow] = useState<InventoryRow | null>(null);

  const skuDetailsQuery = useQuery({
    queryKey: ["sku", selectedRow?.skuId],
    queryFn: () => getSkuApi(selectedRow!.skuId),
    enabled: Boolean(selectedRow),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory", storeId],
    queryFn: () => listInventoryApi(storeId!),
    enabled: Boolean(storeId),
  });

  const rows = data?.data ?? [];
  const healthy = rows.filter((r) => r.availableQty >= r.reorderThreshold);
  const low = rows.filter((r) => r.availableQty > 0 && r.availableQty < r.reorderThreshold);
  const out = rows.filter((r) => r.availableQty <= 0);

  const visibleRows =
    filter === "healthy" ? healthy : filter === "low" ? low : filter === "out" ? out : rows;

  const invalidateInventory = () =>
    queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });

  const thresholdMutation = useMutation({
    mutationFn: ({ skuId, reorderThreshold }: { skuId: string; reorderThreshold: number }) =>
      updateSkuMappingApi(storeId!, skuId, { reorderThreshold }),
    onSuccess: () => {
      invalidateInventory();
      toast.success("Reorder threshold updated");
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to update reorder threshold")),
  });

  return (
    <AppShell
      role="manager"
      shellTitle="Inventory Manager"
      searchPlaceholder="Search SKU, category..."
    >
      <PageHeader
        title="Inventory Management"
        subtitle="Real-time tracking from inventory_snapshot."
        actions={
          <Link
            to="/manager/ledger"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-outline-variant bg-surface text-sm font-semibold text-on-surface hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            Ledger
          </Link>
        }
      />

      {!storeId && (
        <p className="mb-4 text-sm text-destructive">
          No store linked to this user. Sign in with a store manager account.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <MetricCard
          label="Total SKUs"
          value={String(rows.length)}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <MetricCard
          label="Healthy Stock"
          value={String(healthy.length)}
          accent="border-b-[3px] border-[oklch(0.5_0.16_155)]"
          active={filter === "healthy"}
          onClick={() => setFilter("healthy")}
        />
        <MetricCard
          label="Low Stock"
          value={String(low.length)}
          accent="border-b-[3px] border-[oklch(0.75_0.16_75)]"
          active={filter === "low"}
          onClick={() => setFilter("low")}
        />
        <MetricCard
          label="Out of Stock"
          value={String(out.length)}
          accent="border-b-[3px] border-destructive"
          active={filter === "out"}
          onClick={() => setFilter("out")}
        />
      </div>

      <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-on-surface">Live SKU Table</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {isLoading
                ? "Loading…"
                : error
                  ? "Failed to load inventory"
                  : `${visibleRows.length} of ${rows.length} mapped SKUs${filter === "all" ? "" : ` · ${filter} stock`}`}
            </p>
          </div>
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-sm font-semibold text-primary hover:opacity-80"
            >
              Clear filter
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
            <tr>
              <th className="px-6 py-4 text-left font-semibold">SKU ID</th>
              <th className="px-6 py-4 text-left font-semibold">Product Name</th>
              <th className="px-6 py-4 text-left font-semibold">Category</th>
              <th className="px-6 py-4 text-left font-semibold">Available</th>
              <th className="px-6 py-4 text-left font-semibold">Reorder At</th>
              <th className="px-6 py-4 text-left font-semibold">Status</th>
              <th className="px-6 py-4 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {visibleRows.map((row) => {
              const st = stockStatus(row.availableQty, row.reorderThreshold);
              return (
                <tr key={row.skuId} className="hover:bg-surface-container-low">
                  <td className="px-6 py-5 font-semibold text-on-surface font-mono text-xs">
                    {row.skuId.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-5 font-semibold text-on-surface">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="text-left text-primary underline underline-offset-4 decoration-primary/30 font-semibold transition-colors hover:text-primary/80"
                    >
                      {row.skuName}
                    </button>
                  </td>
                  <td className="px-6 py-5 text-on-surface">{row.category ?? "—"}</td>
                  <td className="px-6 py-5 font-bold text-on-surface">{row.availableQty}</td>
                  <td className="px-6 py-5">
                    <input
                      type="number"
                      min="0"
                      key={`${row.skuId}-${row.reorderThreshold}`}
                      defaultValue={row.reorderThreshold}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next < 0 || next === row.reorderThreshold)
                          return;
                        thresholdMutation.mutate({ skuId: row.skuId, reorderThreshold: next });
                      }}
                      className="w-20 bg-surface-container-low border border-outline-variant rounded-xl px-3 py-1.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </td>
                  <td className="px-6 py-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="px-4 py-2 rounded-full border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovementRow(row)}
                      className="px-4 py-2 rounded-full border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low"
                    >
                      Adjust Stock
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">
                  {rows.length === 0
                    ? "No inventory yet — assign SKUs first, then stock them in above."
                    : "No SKUs match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <StockMovementDialog
        row={movementRow}
        storeId={storeId ?? null}
        onClose={() => setMovementRow(null)}
        onSuccess={invalidateInventory}
      />

      <Sheet open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selectedRow?.skuName ?? "Product details"}</SheetTitle>
            <SheetDescription>
              {[selectedRow?.brand, selectedRow?.category].filter(Boolean).join(" · ") ||
                "Product details"}
            </SheetDescription>
          </SheetHeader>

          {selectedRow ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4">
                <div className="w-full aspect-4/3 rounded-3xl border border-outline-variant bg-surface-container-low overflow-hidden">
                  {skuDetailsQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center text-on-surface-variant">
                      Loading image…
                    </div>
                  ) : skuDetailsQuery.data?.images?.[0] ? (
                    <img
                      src={skuDetailsQuery.data.images[0]}
                      alt={selectedRow.skuName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-5xl">inventory_2</span>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant">
                      SKU ID
                    </p>
                    <p className="font-mono text-sm text-on-surface mt-1">{selectedRow.skuId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant">
                      Available
                    </p>
                    <p className="font-semibold text-on-surface mt-1">{selectedRow.availableQty}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant">
                      Reorder threshold
                    </p>
                    <p className="font-semibold text-on-surface mt-1">{selectedRow.reorderThreshold}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant">
                      Base price
                    </p>
                    <p className="font-semibold text-on-surface mt-1">₹{selectedRow.basePrice}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant mb-2">
                    Description
                  </p>
                  {skuDetailsQuery.isLoading ? (
                    <p className="text-sm text-on-surface-variant">Loading description…</p>
                  ) : skuDetailsQuery.error ? (
                    <p className="text-sm text-destructive">Failed to load description.</p>
                  ) : skuDetailsQuery.data?.description ? (
                    <p className="text-sm text-on-surface-variant">{skuDetailsQuery.data.description}</p>
                  ) : (
                    <p className="text-sm text-on-surface-variant">No description available.</p>
                  )}
                </div>

                {skuDetailsQuery.data?.specs && skuDetailsQuery.data.specs.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant mb-2">
                      Specifications
                    </p>
                    <dl className="rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
                      {skuDetailsQuery.data.specs.map((spec) => (
                        <div key={spec.key} className="flex items-center justify-between gap-4 px-3 py-3 text-sm">
                          <dt className="text-on-surface-variant">{spec.key}</dt>
                          <dd className="font-semibold text-on-surface text-right">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function StockMovementDialog({
  row,
  storeId,
  onClose,
  onSuccess,
}: {
  row: InventoryRow | null;
  storeId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<MovementType>("stock_in");
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState("");

  const reset = () => {
    setType("stock_in");
    setQuantity("");
    setSource("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (type === "stock_in") {
        return stockInApi(storeId!, {
          skuId: row!.skuId,
          quantity: qty,
          source: source || undefined,
        });
      }
      if (SIGNED_TYPES.has(type)) {
        return inventoryMovementApi(storeId!, {
          skuId: row!.skuId,
          type,
          signedQuantity: qty,
          source: source || undefined,
        });
      }
      return inventoryMovementApi(storeId!, {
        skuId: row!.skuId,
        type,
        quantity: Math.abs(qty),
        source: source || undefined,
      });
    },
    onSuccess: () => {
      toast.success(`${MOVEMENT_LABEL[type]} recorded for ${row?.skuName}`);
      onSuccess();
      reset();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to record stock movement")),
  });

  const qtyValue = Number(quantity);
  const canSubmit = row && quantity.trim() !== "" && Number.isFinite(qtyValue) && qtyValue !== 0;

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Adjust Stock — {row.skuName}</DialogTitle>
              <DialogDescription>
                Currently {row.availableQty} units available. This writes an entry to the inventory
                ledger.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                  Movement type
                </label>
                <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {MOVEMENT_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                  {SIGNED_TYPES.has(type) ? "Change (use − for a decrease)" : "Quantity"}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={SIGNED_TYPES.has(type) ? "e.g. -3 or 5" : "e.g. 20"}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
                  Reference / note (optional)
                </label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. supplier invoice #, reason"
                  className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            <DialogFooter className="mt-2">
              <button
                type="button"
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {mutation.isPending ? "Saving…" : "Record Movement"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: string;
  accent?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-surface p-5 rounded-[28px] border shadow-sm min-h-30 transition-colors ${accent ?? ""} ${
        active
          ? "border-primary ring-2 ring-primary/20"
          : "border-outline-variant hover:bg-surface-container-low"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold">
        {label}
      </p>
      <h3 className="text-4xl font-extrabold tracking-tight text-on-surface mt-3">{value}</h3>
    </button>
  );
}
