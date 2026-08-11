import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { listSkusApi } from "@/lib/api";

export const Route = createFileRoute("/admin/master-catalog/")({
  component: MasterCatalog,
});

function MasterCatalog() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["catalog", "skus"],
    queryFn: () => listSkusApi(),
  });

  const products = data?.data ?? [];
  const live = products.filter((p) => p.status === "active").length;
  const draft = products.filter((p) => p.status === "draft").length;
  const archived = products.filter((p) => p.status === "archived").length;

  const q = search.trim().toLowerCase();
  const visibleProducts = q
    ? products.filter((p) =>
        `${p.name} ${p.brand ?? ""} ${p.category ?? ""} ${p.barcode ?? ""} ${p.skuCode ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : products;

  return (
    <AppShell
      role="admin"
      searchPlaceholder="Search Master Catalog…"
      searchValue={search}
      onSearchChange={setSearch}
      primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}
    >
      <PageHeader
        crumbs={[{ label: "Catalog Management" }, { label: "Master Catalog" }]}
        title="Inventory List"
        subtitle="Manage and monitor all stock keeping units across the entire ecosystem."
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon="inventory_2" label="Total SKUs" value={String(products.length)} />
        <StatCard icon="check_circle" label="Live" value={String(live)} tone="success" />
        <StatCard icon="edit_note" label="Draft" value={String(draft)} />
        <StatCard icon="block" label="Archived" value={String(archived)} tone="warning" />
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
          <p className="text-sm text-on-surface-variant">
            {isLoading
              ? "Loading catalog…"
              : q
                ? `${visibleProducts.length} of ${products.length} SKUs match "${search}"`
                : `${products.length} SKUs from API`}
          </p>
          <Link
            to="/admin/sku/new"
            className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
          >
            + Add SKU
          </Link>
        </div>

        {error && (
          <p className="px-6 py-4 text-sm text-destructive">
            Failed to load catalog. Is dark-store-api running on :3001?
          </p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
              <th className="px-6 py-3 font-semibold">Image</th>
              <th className="px-6 py-3 font-semibold">SKU ID</th>
              <th className="px-6 py-3 font-semibold">Product</th>
              <th className="px-6 py-3 font-semibold">Category</th>
              <th className="px-6 py-3 font-semibold">List Price</th>
              <th className="px-6 py-3 font-semibold">Barcode</th>
              <th className="px-6 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {visibleProducts.map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate({ to: "/admin/sku/$skuId/edit", params: { skuId: p.id } })}
                className="hover:bg-surface-container-low cursor-pointer"
              >
                <td className="px-6 py-4">
                  {p.images?.[0] ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-14 h-14 rounded-lg object-cover border border-outline-variant"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-surface-container-low border border-outline-variant flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant text-[22px]">
                        image
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-primary">
                  {p.skuCode ?? `${p.id.slice(0, 8)}…`}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface truncate">{p.name}</p>
                    {p.variants?.length > 0 && (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                        {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant">{p.brand ?? "—"}</p>
                </td>
                <td className="px-6 py-4 text-on-surface-variant">{p.category ?? "—"}</td>
                <td className="px-6 py-4 font-semibold">${p.basePrice}</td>
                <td className="px-6 py-4 font-mono text-xs text-on-surface-variant">{p.barcode ?? "—"}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                      p.status === "active"
                        ? "bg-[oklch(0.62_0.16_155)]/10 text-[oklch(0.4_0.16_155)]"
                        : p.status === "draft"
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && visibleProducts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">
                  {q ? "No SKUs match your search." : "No SKUs yet — create one from Add SKU."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
