import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { listStoresApi, listSkuMappingsApi, updateSkuMappingApi } from "@/lib/api";
import { ApiError, type SkuMapping } from "@/lib/api/types";

export const Route = createFileRoute("/admin/pricing")({
  component: Pricing,
});

/** Strips everything but digits and a single decimal point — same rule used on the SKU form. */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function PriceRow({
  mapping,
  onSave,
  saving,
}: {
  mapping: SkuMapping;
  onSave: (skuId: string, priceOverride: number | null) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(mapping.priceOverride ?? "");
  const base = Number(mapping.basePrice);
  const dirty = draft !== (mapping.priceOverride ?? "");
  const effective = draft.trim() !== "" ? Number(draft) : base;
  const delta = base > 0 ? Math.round(((effective - base) / base) * 100) : 0;

  return (
    <tr className="hover:bg-surface-container-low">
      <td className="px-6 py-4">
        <p className="font-medium text-on-surface">{mapping.skuName}</p>
        <p className="text-xs text-on-surface-variant">
          {[mapping.brand, mapping.category].filter(Boolean).join(" · ") || "—"}
        </p>
      </td>
      <td className="px-6 py-4 text-on-surface-variant">₹{base.toFixed(2)}</td>
      <td className="px-6 py-4">
        <div className="relative w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">₹</span>
          <input
            type="text"
            inputMode="decimal"
            maxLength={11}
            placeholder={base.toFixed(2)}
            value={draft}
            onChange={(e) => setDraft(sanitizeDecimal(e.target.value))}
            className="w-full pl-6 pr-2 py-2 bg-surface border border-outline-variant rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
          />
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="font-semibold text-on-surface">₹{effective.toFixed(2)}</span>
        {delta !== 0 && (
          <span className={`ml-2 text-xs font-semibold ${delta < 0 ? "text-destructive" : "text-primary"}`}>
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(mapping.skuId, draft.trim() === "" ? null : Number(draft))}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {mapping.priceOverride !== null && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft("");
                onSave(mapping.skuId, null);
              }}
              className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function Pricing() {
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const storesQuery = useQuery({ queryKey: ["stores"], queryFn: () => listStoresApi() });
  const stores = storesQuery.data?.data ?? [];
  const activeStoreId = storeId ?? stores[0]?.id ?? null;

  const mappingsQuery = useQuery({
    queryKey: ["stores", activeStoreId, "sku-mappings"],
    queryFn: () => listSkuMappingsApi(activeStoreId!),
    enabled: Boolean(activeStoreId),
  });

  const mappings = (mappingsQuery.data?.data ?? []).filter((m) => m.isListed);
  const filtered = mappings.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.skuName.toLowerCase().includes(q) ||
      (m.brand ?? "").toLowerCase().includes(q) ||
      (m.category ?? "").toLowerCase().includes(q)
    );
  });

  const overriddenCount = mappings.filter((m) => m.priceOverride !== null).length;
  const avgDelta = (() => {
    const withOverride = mappings.filter((m) => m.priceOverride !== null);
    if (withOverride.length === 0) return 0;
    const total = withOverride.reduce((sum, m) => {
      const base = Number(m.basePrice);
      const override = Number(m.priceOverride);
      return base > 0 ? sum + ((override - base) / base) * 100 : sum;
    }, 0);
    return Math.round(total / withOverride.length);
  })();

  const mutation = useMutation({
    mutationFn: ({ skuId, priceOverride }: { skuId: string; priceOverride: number | null }) =>
      updateSkuMappingApi(activeStoreId!, skuId, { priceOverride }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["stores", activeStoreId, "sku-mappings"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to update price");
    },
  });

  const savingSkuId = mutation.isPending ? mutation.variables?.skuId : undefined;

  return (
    <AppShell role="admin" searchPlaceholder="Search products…" searchValue={search} onSearchChange={setSearch}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Pricing" }]}
        title="Pricing"
        subtitle="Per-store price overrides — leave blank to use the catalog base price."
      />

      {stores.length === 0 && !storesQuery.isLoading ? (
        <div className="bg-surface rounded-2xl border border-outline-variant p-10 text-center text-on-surface-variant">
          No dark stores yet — add one to manage its pricing.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStoreId(s.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  s.id === activeStoreId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {s.name}
                {s.code ? ` · ${s.code}` : ""}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <StatCard icon="sell" label="Listed SKUs" value={String(mappings.length)} />
            <StatCard icon="price_change" label="Active Overrides" value={String(overriddenCount)} tone="success" />
            <StatCard
              icon={avgDelta < 0 ? "trending_down" : "trending_up"}
              label="Avg. Override Delta"
              value={`${avgDelta > 0 ? "+" : ""}${avgDelta}%`}
              tone={avgDelta < 0 ? "warning" : "primary"}
            />
          </div>

          {error && (
            <p className="mb-4 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
          )}

          <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Product</th>
                  <th className="px-6 py-3 text-left font-semibold">Base price</th>
                  <th className="px-6 py-3 text-left font-semibold">Override</th>
                  <th className="px-6 py-3 text-left font-semibold">Effective price</th>
                  <th className="px-6 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {mappingsQuery.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">
                      Loading…
                    </td>
                  </tr>
                )}
                {!mappingsQuery.isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">
                      {mappings.length === 0
                        ? "No SKUs listed at this store yet."
                        : "No products match your search."}
                    </td>
                  </tr>
                )}
                {filtered.map((m) => (
                  <PriceRow
                    key={m.skuId}
                    mapping={m}
                    saving={savingSkuId === m.skuId}
                    onSave={(skuId, priceOverride) => mutation.mutate({ skuId, priceOverride })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
