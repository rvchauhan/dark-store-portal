import { apiRequest } from "./client";
import type {
  CatalogMeta,
  CatalogSku,
  LoginResponse,
  SkuDimensions,
  SkuVariant,
  Store,
  SkuMapping,
  InventoryRow,
  LedgerEntry,
  LedgerSummary,
  VariantOption,
  StaffOrder,
  StaffOrderItem,
  StaffOrderDetail,
  OrderStats,
  OrderStatus,
  NotificationPreferences,
  DashboardStats,
  AnalyticsOverview,
} from "./types";

// --- Auth ---

export function loginApi(email: string, password: string) {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export function registerApi(body: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}) {
  return apiRequest<LoginResponse>("/api/auth/register", {
    method: "POST",
    body,
    auth: false,
  });
}

export function googleAuthApi(idToken: string) {
  return apiRequest<LoginResponse>("/api/auth/google", {
    method: "POST",
    body: { idToken },
    auth: false,
  });
}

export function meApi() {
  return apiRequest<{ user: LoginResponse["user"] }>("/api/auth/me");
}

/** Admin invites a store_manager for a store; returns a one-time setup link token. */
export function inviteManagerApi(body: { email: string; name: string; storeId: string }) {
  return apiRequest<{
    user: { id: string; email: string; name: string };
    inviteToken: string;
    inviteLink: string;
    expiresAt: string;
    emailSent: boolean;
  }>("/api/auth/invite-manager", { method: "POST", body });
}

/** Public — resolves a setup-link token to the invitee's email/name for the set-password page. */
export function getInviteApi(token: string) {
  return apiRequest<{ email: string; name: string }>(`/api/auth/invite/${token}`, { auth: false });
}

/** Public — invitee sets their own password; response auto-logs them in. */
export function acceptInviteApi(body: { token: string; password: string }) {
  return apiRequest<LoginResponse>("/api/auth/accept-invite", {
    method: "POST",
    body,
    auth: false,
  });
}

export function changePasswordApi(body: { currentPassword: string; newPassword: string }) {
  return apiRequest<{ success: boolean }>("/api/auth/change-password", { method: "POST", body });
}

export function getNotificationPreferencesApi() {
  return apiRequest<{ preferences: NotificationPreferences }>("/api/auth/notification-preferences");
}

export function updateNotificationPreferencesApi(preferences: NotificationPreferences) {
  return apiRequest<{ preferences: NotificationPreferences }>(
    "/api/auth/notification-preferences",
    {
      method: "PATCH",
      body: preferences,
    },
  );
}

// --- Catalog ---

export function listSkusApi(params?: { status?: string; search?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiRequest<{ data: CatalogSku[] }>(`/api/catalog/skus${qs ? `?${qs}` : ""}`);
}

export function createSkuApi(body: {
  name: string;
  brand?: string;
  category?: string;
  barcode?: string;
  basePrice: number;
  currency?: string;
  compareAtPrice?: number;
  costPrice?: number;
  taxRate?: number;
  allowBackorder?: boolean;
  unitOfMeasure?: string;
  skuCode?: string;
  isFragile?: boolean;
  requiresColdStorage?: boolean;
  weightKg?: number;
  dimensionsCm?: SkuDimensions;
  defaultReorderPoint?: number;
  defaultInitialStock?: number;
  variantOptions?: VariantOption[];
  variants?: SkuVariant[];
  description?: string;
  images?: string[];
  status?: "draft" | "active";
}) {
  return apiRequest<CatalogSku>("/api/catalog/skus", { method: "POST", body });
}

export function getCatalogMetaApi() {
  return apiRequest<CatalogMeta>("/api/catalog/meta");
}

export function getSkuApi(skuId: string) {
  return apiRequest<CatalogSku>(`/api/catalog/skus/${skuId}`);
}

export function updateSkuApi(
  skuId: string,
  body: Partial<{
    name: string;
    brand: string;
    category: string;
    barcode: string;
    basePrice: number;
    currency: string;
    compareAtPrice: number;
    costPrice: number;
    taxRate: number;
    allowBackorder: boolean;
    unitOfMeasure: string;
    skuCode: string;
    isFragile: boolean;
    requiresColdStorage: boolean;
    weightKg: number;
    dimensionsCm: SkuDimensions;
    defaultReorderPoint: number;
    defaultInitialStock: number;
    variantOptions: VariantOption[];
    variants: SkuVariant[];
    description: string;
    images: string[];
    status: "draft" | "active" | "archived";
  }>,
) {
  return apiRequest<CatalogSku>(`/api/catalog/skus/${skuId}`, { method: "PATCH", body });
}

/** Uploads a product image as base64 JSON; resolves to its public URL. */
export async function uploadCatalogImageApi(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1)); // strip data:*;base64, prefix
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  return apiRequest<{ url: string }>("/api/catalog/uploads", {
    method: "POST",
    body: { fileName: file.name, mimeType: file.type, data },
  });
}

// --- Stores ---

export function listStoresApi() {
  return apiRequest<{ data: Store[] }>("/api/stores");
}

export function getDashboardStatsApi() {
  return apiRequest<DashboardStats>("/api/stores/dashboard-stats");
}

// --- Analytics ---

export function getAnalyticsOverviewApi() {
  return apiRequest<AnalyticsOverview>("/api/analytics/overview");
}

export function getStoreApi(storeId: string) {
  return apiRequest<Store>(`/api/stores/${storeId}`);
}

export function createStoreApi(body: {
  name: string;
  code?: string;
  address: string;
  geofence: Record<string, unknown>;
  operatingHours: Record<string, unknown>;
  facility?: Record<string, unknown>;
  managerEmail?: string;
  managerName?: string;
}) {
  return apiRequest<Store>("/api/stores", { method: "POST", body });
}

export function updateStoreApi(
  storeId: string,
  body: Partial<{
    name: string;
    code: string;
    address: string;
    geofence: Record<string, unknown>;
    operatingHours: Record<string, unknown>;
    facility: Record<string, unknown>;
    managerEmail: string;
    managerName: string;
  }>,
) {
  return apiRequest<Store>(`/api/stores/${storeId}`, { method: "PATCH", body });
}

export function activateStoreApi(storeId: string) {
  return apiRequest<Store>(`/api/stores/${storeId}/activate`, { method: "POST" });
}

export function listSkuMappingsApi(storeId: string) {
  return apiRequest<{ data: SkuMapping[] }>(`/api/stores/${storeId}/sku-mappings`);
}

export function assignSkuMappingApi(
  storeId: string,
  body: {
    skuId?: string;
    barcode?: string;
    priceOverride?: number | null;
    isListed?: boolean;
    reorderThreshold?: number;
  },
) {
  return apiRequest<SkuMapping>(`/api/stores/${storeId}/sku-mappings`, { method: "POST", body });
}

export function updateSkuMappingApi(
  storeId: string,
  skuId: string,
  body: {
    priceOverride?: number | null;
    isListed?: boolean;
    reorderThreshold?: number;
  },
) {
  return apiRequest<SkuMapping>(`/api/stores/${storeId}/sku-mappings/${skuId}`, {
    method: "PATCH",
    body,
  });
}

export function bulkSkuMappingsApi(
  storeId: string,
  body: {
    mappings?: Array<{
      skuId?: string;
      barcode?: string;
      priceOverride?: number | null;
      isListed?: boolean;
      reorderThreshold?: number;
    }>;
    csv?: string;
  },
) {
  return apiRequest<{ assigned: number; data: SkuMapping[] }>(
    `/api/stores/${storeId}/sku-mappings/bulk`,
    { method: "POST", body },
  );
}

// --- Geo ---

/**
 * Forward geocoding (address → coordinates) for the dark-store wizard's map.
 * The API tries progressively looser matches server-side, so `precision`
 * tells the caller whether the result is an exact street match or just
 * centered on the city/postal code area.
 */
export function geocodeAddressApi(input: {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}) {
  const q = new URLSearchParams();
  if (input.street) q.set("street", input.street);
  if (input.city) q.set("city", input.city);
  if (input.postalCode) q.set("postalCode", input.postalCode);
  if (input.country) q.set("country", input.country);
  return apiRequest<{
    lat: number;
    lng: number;
    displayName: string;
    precision: "exact" | "approximate";
  }>(`/api/geo/lookup?${q}`);
}

// --- Inventory ---

export function listInventoryApi(storeId: string) {
  return apiRequest<{ data: InventoryRow[] }>(`/api/stores/${storeId}/inventory`);
}

export function listLedgerApi(
  storeId: string,
  params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    skuId?: string;
    from?: string;
    to?: string;
  },
) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  if (params?.type) q.set("type", params.type);
  if (params?.skuId) q.set("skuId", params.skuId);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiRequest<{
    data: LedgerEntry[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/stores/${storeId}/inventory/ledger${qs ? `?${qs}` : ""}`);
}

export function ledgerSummaryApi(storeId: string) {
  return apiRequest<LedgerSummary>(`/api/stores/${storeId}/inventory/ledger/summary`);
}

export function stockInApi(
  storeId: string,
  body: { skuId: string; quantity: number; source?: string },
) {
  return apiRequest(`/api/stores/${storeId}/inventory/stock-in`, { method: "POST", body });
}

export function inventoryMovementApi(
  storeId: string,
  body: {
    skuId: string;
    type: "stock_in" | "sale" | "damage" | "return" | "adjustment" | "correction";
    quantity?: number;
    signedQuantity?: number;
    source?: string;
  },
) {
  return apiRequest(`/api/stores/${storeId}/inventory/movements`, { method: "POST", body });
}

// --- Orders (staff-facing fulfillment) ---

export function listStoreOrdersApi(storeId: string, status: "active" | "all" = "active") {
  return apiRequest<{ data: StaffOrder[] }>(`/api/stores/${storeId}/orders?status=${status}`);
}

export function getOrderStatsApi(storeId: string) {
  return apiRequest<OrderStats>(`/api/stores/${storeId}/orders/stats`);
}

export function getStoreOrderApi(storeId: string, orderId: string) {
  return apiRequest<{ order: StaffOrderDetail; items: StaffOrderItem[] }>(
    `/api/stores/${storeId}/orders/${orderId}`,
  );
}

export function updateOrderStatusApi(
  storeId: string,
  orderId: string,
  status: OrderStatus,
  payload?:
    | { riderName: string; riderPhone: string }
    | {
        trackingName: string;
        trackingNumber: string;
        trackingUrl: string;
      },
) {
  return apiRequest<StaffOrderDetail>(`/api/stores/${storeId}/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status, ...payload },
  });
}
