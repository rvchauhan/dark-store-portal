import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import { inventoryMovementApi, ledgerSummaryApi, listInventoryApi, listLedgerApi } from "@/lib/api";
import { ApiError } from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/manager/ledger")({
  component: Ledger,
});

const typeStyles: Record<string, string> = {
  stock_in: "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]",
  sale: "bg-[oklch(0.93_0.06_240)] text-[oklch(0.48_0.09_240)]",
  damage: "bg-destructive/10 text-destructive",
  return: "bg-[oklch(0.75_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
  adjustment: "bg-primary/10 text-primary",
  correction: "bg-surface-container-high text-on-surface-variant",
};

const LEDGER_TYPES = ["stock_in", "sale", "damage", "return", "adjustment", "correction"] as const;
const ENTRY_TYPES = ["stock_in", "damage", "return", "adjustment", "correction"] as const;
type EntryType = (typeof ENTRY_TYPES)[number];
const SIGNED_TYPES = new Set<EntryType>(["adjustment", "correction"]);

const PAGE_SIZE = 25;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

function Ledger() {
  const session = useSession();
  const storeId = session?.storeId;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("all");
  const [skuId, setSkuId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const ledgerQuery = useQuery({
    queryKey: ["ledger", storeId, page, type, skuId, from, to],
    queryFn: () =>
      listLedgerApi(storeId!, {
        page,
        pageSize: PAGE_SIZE,
        type: type === "all" ? undefined : type,
        skuId: skuId === "all" ? undefined : skuId,
        from: from || undefined,
        to: to || undefined,
      }),
    enabled: Boolean(storeId),
  });

  const summaryQuery = useQuery({
    queryKey: ["ledger-summary", storeId],
    queryFn: () => ledgerSummaryApi(storeId!),
    enabled: Boolean(storeId),
  });

  // Reused to populate the SKU filter dropdown and the "Add Entry" SKU picker.
  const inventoryQuery = useQuery({
    queryKey: ["inventory", storeId],
    queryFn: () => listInventoryApi(storeId!),
    enabled: Boolean(storeId),
  });

  const entries = ledgerQuery.data?.data ?? [];
  const pagination = ledgerQuery.data?.pagination;
  const summary = summaryQuery.data;
  const skus = inventoryQuery.data?.data ?? [];

  const resetToFirstPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setPage(1);
      setter(v);
    };

  return (
    <AppShell role="manager" shellTitle="Inventory Ledger" searchPlaceholder="Search inventory...">
      <PageHeader
        title="Inventory Ledger"
        subtitle="Real-time transactional audit from inventory_ledger."
        actions={
          <button
            type="button"
            onClick={() => setEntryDialogOpen(true)}
            disabled={!storeId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Entry
          </button>
        }
      />

      {!storeId && (
        <p className="mb-4 text-sm text-destructive">
          No store on session — login as manager@qcommerce.io.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div>
          <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
            Action Type
          </label>
          <Select value={type} onValueChange={resetToFirstPage(setType)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {LEDGER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
            SKU
          </label>
          <Select value={skuId} onValueChange={resetToFirstPage(setSkuId)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SKUs</SelectItem>
              {skus.map((s) => (
                <SelectItem key={s.skuId} value={s.skuId}>
                  {s.skuName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => resetToFirstPage(setFrom)(e.target.value)}
            className="bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => resetToFirstPage(setTo)(e.target.value)}
            className="bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>

        {(type !== "all" || skuId !== "all" || from || to) && (
          <button
            type="button"
            onClick={() => {
              setType("all");
              setSkuId("all");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="text-sm font-semibold text-primary hover:opacity-80 mb-2.5"
          >
            Clear filters
          </button>
        )}
      </div>

      <section className="bg-surface rounded-[30px] border border-outline-variant shadow-sm overflow-hidden">
        <TooltipProvider delayDuration={0}>
          <table className="w-full text-sm">
            <thead className="text-xs text-on-surface-variant uppercase tracking-[0.16em] bg-surface-container-low">
            <tr>
              <th className="px-6 py-5 text-left font-semibold">Timestamp</th>
              <th className="px-6 py-5 text-left font-semibold">SKU / Item</th>
              <th className="px-6 py-5 text-left font-semibold">Action</th>
              <th className="px-6 py-5 text-left font-semibold">Qty</th>
              <th className="px-6 py-5 text-left font-semibold">Balance</th>
              <th className="px-6 py-5 text-left font-semibold">Reason / Reference</th>
              <th className="px-6 py-5 text-left font-semibold">Performed By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-surface-container-low">
                <td className="px-6 py-5">
                  <p className="font-semibold text-on-surface">
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                </td>
                <td className="px-6 py-5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="font-bold text-on-surface font-mono text-xs cursor-help">
                        {e.skuId.slice(0, 8)}…
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>{e.skuId}</TooltipContent>
                  </Tooltip>
                  <p className="text-sm text-on-surface mt-1">{e.skuName}</p>
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                      typeStyles[e.type] ?? "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {e.type}
                  </span>
                </td>
                <td
                  className={`px-6 py-5 text-2xl font-bold ${
                    e.quantity > 0 ? "text-[oklch(0.4_0.16_155)]" : "text-destructive"
                  }`}
                >
                  {e.quantity > 0 ? `+${e.quantity}` : e.quantity}
                </td>
                <td className="px-6 py-5 text-xl font-semibold text-on-surface">{e.balance}</td>
                <td className="px-6 py-5 text-on-surface">{e.source ?? "—"}</td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                      {(e.employeeName ?? "?")
                        .split(" ")
                        .map((s) => s[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span className="font-medium text-on-surface">
                      {e.employeeName ?? "System"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {!ledgerQuery.isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">
                  No ledger entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </TooltipProvider>

        <div className="flex items-center justify-between px-6 py-5 border-t border-outline-variant">
          <p className="text-sm text-on-surface-variant">
            {pagination
              ? `Showing page ${pagination.page} of ${Math.max(pagination.totalPages, 1)} (${pagination.total} entries)`
              : ledgerQuery.isLoading
                ? "Loading…"
                : "—"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-full border border-outline-variant text-sm font-semibold text-on-surface disabled:opacity-40 hover:bg-surface-container-low"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination || page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-full border border-outline-variant text-sm font-semibold text-on-surface disabled:opacity-40 hover:bg-surface-container-low"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
        <MetricCard label="Total Restock (24h)" value={`+${summary?.restockUnits ?? 0}`} />
        <MetricCard label="Total Picked (24h)" value={`-${summary?.pickedUnits ?? 0}`} />
        <MetricCard label="Damage (24h)" value={String(summary?.damageUnits ?? 0)} />
      </div>

      <AddEntryDialog
        open={entryDialogOpen}
        storeId={storeId ?? null}
        skus={skus}
        onClose={() => setEntryDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["ledger", storeId] });
          queryClient.invalidateQueries({ queryKey: ["ledger-summary", storeId] });
          queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });
        }}
      />
    </AppShell>
  );
}

function AddEntryDialog({
  open,
  storeId,
  skus,
  onClose,
  onSuccess,
}: {
  open: boolean;
  storeId: string | null;
  skus: { skuId: string; skuName: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [skuId, setSkuId] = useState<string>("");
  const [type, setType] = useState<EntryType>("adjustment");
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState("");

  const reset = () => {
    setSkuId("");
    setType("adjustment");
    setQuantity("");
    setSource("");
  };

  const mutation = useMutation({
    mutationFn: () => {
      const qty = Number(quantity);
      return inventoryMovementApi(storeId!, {
        skuId,
        type,
        ...(SIGNED_TYPES.has(type) ? { signedQuantity: qty } : { quantity: Math.abs(qty) }),
        source: source || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Ledger entry recorded");
      onSuccess();
      reset();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Failed to record entry")),
  });

  const qtyValue = Number(quantity);
  const canSubmit = skuId && quantity.trim() !== "" && Number.isFinite(qtyValue) && qtyValue !== 0;

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
          <DialogTitle>Add Ledger Entry</DialogTitle>
          <DialogDescription>Manually record a stock adjustment or correction.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
              SKU
            </label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a SKU" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.skuId} value={s.skuId}>
                    {s.skuName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold mb-2">
              Entry type
            </label>
            <Select value={type} onValueChange={(v) => setType(v as EntryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
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
              Reason / reference (optional)
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
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
            {mutation.isPending ? "Saving…" : "Add Entry"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="bg-surface rounded-[28px] border border-outline-variant shadow-sm p-6">
      <p className="text-xs uppercase tracking-[0.16em] text-on-surface-variant font-semibold">
        {label}
      </p>
      <h3 className="text-4xl font-extrabold tracking-tight text-on-surface mt-2">{value}</h3>
      <span className="text-sm text-on-surface-variant">Units</span>
    </section>
  );
}
