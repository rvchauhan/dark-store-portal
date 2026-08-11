/**
 * Shared API types matching dark-store-api responses.
 * Keep portal-facing role separate from API role for existing AppShell checks.
 */

export type ApiRole = "business_admin" | "store_manager" | "store_employee";
export type PortalRole = "admin" | "manager";

export type ApiUser = {
  userId: string;
  businessId: string;
  role: ApiRole;
  storeId: string | null;
  email: string;
  name: string;
};

export type LoginResponse = {
  token: string;
  user: ApiUser;
};

export type SkuDimensions = {
  length: number;
  width: number;
  height: number;
};

export type VariantOption = {
  name: string;
  values: string[];
};

/** Free-form product spec sheet row, e.g. { key: "Processor", value: "Intel i8" }. */
export type SkuSpec = {
  key: string;
  value: string;
};

/** One row of the generated variant matrix; price/barcode/stock override the parent SKU's when set. */
export type SkuVariant = {
  id: string;
  options: Record<string, string>;
  price?: number;
  barcode?: string;
  stock?: number;
};

export type CatalogSku = {
  id: string;
  businessId: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  basePrice: string;
  currency: string;
  compareAtPrice: string | null;
  costPrice: string | null;
  taxRate: string;
  allowBackorder: boolean;
  unitOfMeasure: string;
  skuCode: string | null;
  isFragile: boolean;
  requiresColdStorage: boolean;
  weightKg: string | null;
  dimensionsCm: SkuDimensions | null;
  defaultReorderPoint: number;
  defaultInitialStock: number | null;
  variantOptions: VariantOption[];
  variants: SkuVariant[];
  images: string[];
  description: string | null;
  specs: SkuSpec[];
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CatalogMeta = {
  brands: string[];
  categories: string[];
};

export type Store = {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  address: string;
  geofence: unknown;
  operatingHours: unknown;
  facility: unknown;
  status: "onboarding" | "active" | "inactive" | "closed";
  managerUserId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerStatus: "invited" | "active" | "disabled" | null;
  createdAt: string;
  updatedAt: string;
};

export type SkuMapping = {
  id: string;
  storeId: string;
  skuId: string;
  priceOverride: string | null;
  isListed: boolean;
  reorderThreshold: number;
  createdAt: string;
  updatedAt: string;
  skuName: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  basePrice: string;
  catalogStatus: string;
};

export type InventoryRow = {
  storeId: string;
  skuId: string;
  availableQty: number;
  lastLedgerId: string | null;
  updatedAt: string;
  isListed: boolean;
  priceOverride: string | null;
  reorderThreshold: number;
  skuName: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  basePrice: string;
};

export type LedgerEntry = {
  id: string;
  storeId: string;
  skuId: string;
  type: string;
  quantity: number;
  referenceId: string | null;
  source: string | null;
  createdAt: string;
  employeeId: string | null;
  employeeName: string | null;
  skuName: string;
  barcode: string | null;
  category: string | null;
  balance: number;
};

export type LedgerSummary = {
  since: string;
  restockUnits: number;
  pickedUnits: number;
  damageUnits: number;
  returnUnits: number;
  adjustmentUnits: number;
};

export type OrderStatus =
  "placed" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";

/** One row of the manager Dashboard/Orders queue — GET /stores/:id/orders */
export type StaffOrder = {
  id: string;
  status: OrderStatus;
  paymentMethod: string;
  itemsTotal: string;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  itemCount: number;
};

/** `brand`..`skuCode` come from a left join onto `master_catalog` — null if the SKU was later archived/deleted. */
export type StaffOrderItem = {
  id: string;
  orderId: string;
  skuId: string;
  nameSnapshot: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  brand: string | null;
  category: string | null;
  images: string[] | null;
  description: string | null;
  isFragile: boolean | null;
  requiresColdStorage: boolean | null;
  weightKg: string | null;
  dimensionsCm: SkuDimensions | null;
  barcode: string | null;
  skuCode: string | null;
  specs: SkuSpec[] | null;
};

export type StaffOrderDetail = {
  id: string;
  storeId: string;
  status: OrderStatus;
  deliveryAddress: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    phone: string;
  };
  paymentMethod: string;
  itemsTotal: string;
  deliveryFee: string;
  handlingFee: string;
  totalAmount: string;
  riderName: string | null;
  riderPhone: string | null;
  trackingName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerPhone: string | null;
};

export type OrderStats = {
  todayCount: number;
  activeCount: number;
  todayRevenue: number;
};

/** One row of the admin Dashboard's "Units picked by store" chart / Top performers list. */
export type StorePickedStat = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  pickedUnits: number;
};

/** GET /api/stores/dashboard-stats — business-wide admin Dashboard, aggregated server-side. */
export type DashboardStats = {
  since: string;
  activeStores: number;
  totalStores: number;
  skusInCatalog: number;
  totalPickedUnits24h: number;
  lowStockAlerts: number;
  perStorePicked: StorePickedStat[];
};

export type SkuSalesStat = {
  skuId: string;
  name: string;
  unitsSold: number;
  revenue: number;
};

/** GET /api/analytics/overview — business-wide admin Analytics, aggregated server-side. */
export type AnalyticsOverview = {
  windowDays: number;
  revenueTrend: { day: string; revenue: number; orderCount: number }[];
  unitsTrend: { day: string; units: number }[];
  topSkus: SkuSalesStat[];
  slowMovers: SkuSalesStat[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  avgFulfillmentMinutes: number | null;
};

export type NotificationPreferences = Record<string, boolean>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toPortalRole(role: ApiRole): PortalRole {
  return role === "business_admin" ? "admin" : "manager";
}
