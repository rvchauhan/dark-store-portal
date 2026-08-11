import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, StatCard } from "@/components/AppShell";
import { jsonBoolean, jsonNumber, jsonString } from "@/components/DarkStoreWizard";
import { getStoreApi, listSkuMappingsApi, listSkusApi } from "@/lib/api";

export const Route = createFileRoute("/admin/dark-stores/$storeId/")({
  component: StoreOverview,
});

function ActionCard({
  icon,
  title,
  description,
  storeId,
  step,
}: {
  icon: string;
  title: string;
  description: string;
  storeId: string;
  step: 1 | 2 | 3;
}) {
  return (
    <Link
      to="/admin/dark-stores/$storeId/edit"
      params={{ storeId }}
      search={{ step }}
      className="bg-surface rounded-2xl border border-outline-variant shadow-sm p-6 flex items-start gap-4 hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-primary text-[24px]">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-on-surface">{title}</h3>
        <p className="text-sm text-on-surface-variant mt-1">{description}</p>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant shrink-0">chevron_right</span>
    </Link>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-outline-variant last:border-b-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-medium text-on-surface text-right">{value}</span>
    </div>
  );
}

function StoreOverview() {
  const { storeId } = Route.useParams();

  const storeQuery = useQuery({ queryKey: ["stores", storeId], queryFn: () => getStoreApi(storeId) });
  const mappingsQuery = useQuery({
    queryKey: ["stores", storeId, "sku-mappings"],
    queryFn: () => listSkuMappingsApi(storeId),
  });
  const skusQuery = useQuery({ queryKey: ["catalog", "skus"], queryFn: () => listSkusApi() });

  const store = storeQuery.data;
  const mappedCount = mappingsQuery.data?.data.length ?? 0;
  const totalCount = skusQuery.data?.data.length ?? 0;
  const coverage = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0;

  if (storeQuery.isLoading) {
    return (
      <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
        <p className="text-sm text-on-surface-variant text-center py-12">Loading store…</p>
      </AppShell>
    );
  }

  if (storeQuery.error || !store) {
    return (
      <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
        <p className="text-sm text-destructive text-center py-12">Failed to load this store.</p>
      </AppShell>
    );
  }

  const openTime = jsonString(store.operatingHours, "open");
  const closeTime = jsonString(store.operatingHours, "close");
  const capacityM3 = jsonNumber(store.facility, "capacityM3");
  const coldStorage = jsonBoolean(store.facility, "coldStorage");
  const contactNumber = jsonString(store.facility, "contactNumber");
  const country = jsonString(store.geofence, "country");
  const radiusKm = jsonNumber(store.geofence, "radiusKm");

  return (
    <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[
          { label: "Management" },
          { label: "Dark Stores", to: "/admin/dark-stores" },
          { label: store.name },
        ]}
        title={store.name}
        subtitle={store.address}
        actions={
          <Link
            to="/admin/dark-stores"
            className="px-5 py-2 rounded-full border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container-low"
          >
            Back to Dark Stores
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard
          icon={store.status === "active" ? "check_circle" : "pending"}
          label="Status"
          value={store.status}
          tone={store.status === "active" ? "success" : "primary"}
        />
        <StatCard
          icon="person"
          label="Manager"
          value={store.managerName ?? "Unassigned"}
          tone={store.managerStatus === "active" ? "success" : store.managerStatus ? "warning" : "primary"}
        />
        <StatCard icon="inventory_2" label="SKUs Mapped" value={`${mappedCount} / ${totalCount}`} />
        <StatCard icon="map_search" label="Coverage" value={`${coverage}%`} tone="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant shadow-sm p-6 h-fit">
          <h3 className="font-bold text-on-surface mb-2">Store Details</h3>
          <DetailRow label="Store Code" value={store.code ?? "—"} />
          <DetailRow label="Country" value={country || "—"} />
          <DetailRow label="Coverage Radius" value={radiusKm != null ? `${radiusKm} km` : "—"} />
          <DetailRow
            label="Working Hours"
            value={openTime && closeTime ? `${openTime} – ${closeTime}` : "—"}
          />
          <DetailRow label="Capacity" value={capacityM3 != null ? `${capacityM3} m³` : "—"} />
          <DetailRow label="Cold Storage" value={coldStorage ? "Yes" : "No"} />
          <DetailRow label="Manager Email" value={store.managerEmail ?? "—"} />
          <DetailRow label="Contact Number" value={contactNumber || "—"} />
        </div>

        <div className="lg:col-span-3 space-y-5">
          <ActionCard
            icon="info"
            title="Store Details"
            description="Name, status, manager, staffing, and operations."
            storeId={storeId}
            step={1}
          />
          <ActionCard
            icon="location_on"
            title="Location & Logistics"
            description="Address, map pin, and delivery coverage radius."
            storeId={storeId}
            step={2}
          />
          <ActionCard
            icon="inventory_2"
            title="Inventory"
            description={`Manage which SKUs are assigned to this store (${mappedCount} mapped).`}
            storeId={storeId}
            step={3}
          />
        </div>
      </div>
    </AppShell>
  );
}
