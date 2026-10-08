import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CoverageMap } from "@/components/CoverageMap";
import {
  activateStoreApi,
  bulkSkuMappingsApi,
  createStoreApi,
  geocodeAddressApi,
  getStoreApi,
  inviteManagerApi,
  listInventoryApi,
  listSkuMappingsApi,
  listSkusApi,
  stockInApi,
  updateStoreApi,
} from "@/lib/api";
import { ApiError, type CatalogSku, type Store } from "@/lib/api/types";

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1, label: "Store Details" },
  { n: 2, label: "Location & Logistics" },
  { n: 3, label: "Inventory" },
  { n: 4, label: "Activation" },
] as const;

/** Free-text Country field with autocomplete — scopes geocoding to cut down on ambiguous matches. */
const COUNTRIES = [
  "United States",
  "United Kingdom",
  "India",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Ireland",
  "Portugal",
  "Poland",
  "Austria",
  "United Arab Emirates",
  "Saudi Arabia",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Thailand",
  "Vietnam",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "New Zealand",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Egypt",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
] as const;

type DraftRow = {
  skuId: string;
  enabled: boolean;
  price: string;
  stock: string;
};

function categoryTone(category: string | null | undefined) {
  const c = (category ?? "").toUpperCase();
  if (c.includes("FRESH") || c.includes("DAIRY")) {
    return "bg-primary-container text-on-primary-container";
  }
  if (c.includes("BAKERY")) {
    return "bg-[oklch(0.92_0.08_75)] text-[oklch(0.45_0.12_75)]";
  }
  if (c.includes("BEVERAGE") || c.includes("DRINK")) {
    return "bg-[oklch(0.93_0.06_165)] text-[oklch(0.42_0.1_165)]";
  }
  return "bg-surface-container-high text-on-surface-variant";
}

function categoryGlyph(category: string | null | undefined) {
  const c = (category ?? "").toUpperCase();
  if (c.includes("DAIRY") || c.includes("MILK")) return "🥛";
  if (c.includes("BAKERY") || c.includes("BREAD")) return "🍞";
  if (c.includes("BEVERAGE") || c.includes("COFFEE")) return "☕";
  if (c.includes("FRESH")) return "🥬";
  return "📦";
}

/** Reads a string field out of a jsonb `unknown` blob (facility / geofence). */
export function jsonString(obj: unknown, key: string): string {
  if (typeof obj !== "object" || obj === null) return "";
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export function jsonNumber(obj: unknown, key: string): number | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

export function jsonBoolean(obj: unknown, key: string): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  return Boolean((obj as Record<string, unknown>)[key]);
}

/**
 * Store onboarding + inventory mapping wizard.
 *
 * Two entry points share this component:
 *   - /admin/dark-stores/new         (no storeId — create flow)
 *   - /admin/dark-stores/$storeId/edit (storeId — edit flow, prefilled)
 */
export function DarkStoreWizard({
  storeId: editStoreId,
  initialStep = 1,
}: {
  storeId?: string;
  /** Lets the store overview page deep-link straight into a specific step (e.g. Inventory Mapping). */
  initialStep?: Step;
}) {
  const isEdit = Boolean(editStoreId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(initialStep);
  const [storeId, setStoreId] = useState<string | null>(editStoreId ?? null);
  const [storeName, setStoreName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const storeQuery = useQuery({
    queryKey: ["stores", editStoreId],
    queryFn: () => getStoreApi(editStoreId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (storeQuery.data) setStoreName(storeQuery.data.name);
  }, [storeQuery.data]);

  const skusQuery = useQuery({
    queryKey: ["catalog", "skus", "active"],
    queryFn: () => listSkusApi({ status: "active" }),
    enabled: step === 3,
  });

  const mappingsQuery = useQuery({
    queryKey: ["stores", storeId, "sku-mappings"],
    queryFn: () => listSkuMappingsApi(storeId!),
    enabled: step === 3 && Boolean(storeId),
  });

  // Current on-hand stock, used to show "Current stock" hints instead of guessing.
  const inventoryQuery = useQuery({
    queryKey: ["stores", storeId, "inventory"],
    queryFn: () => listInventoryApi(storeId!),
    enabled: step === 3 && Boolean(storeId),
  });

  const existingMappingSkuIds = useMemo(
    () => new Set((mappingsQuery.data?.data ?? []).map((m) => m.skuId)),
    [mappingsQuery.data],
  );

  const inventoryBySkuId = useMemo(
    () => new Map((inventoryQuery.data?.data ?? []).map((row) => [row.skuId, row.availableQty])),
    [inventoryQuery.data],
  );

  // Seed local draft rows once catalog + existing mappings are available
  useEffect(() => {
    if (step !== 3 || !skusQuery.data) return;
    const skus = skusQuery.data.data.filter((sku) => sku.status === "active");
    const mappings = mappingsQuery.data?.data ?? [];
    const bySku = new Map(mappings.map((m) => [m.skuId, m]));

    setDrafts((prev) => {
      const next: Record<string, DraftRow> = {};
      for (const sku of skus) {
        const existing = bySku.get(sku.id);
        const prior = prev[sku.id];
        next[sku.id] = prior ?? {
          skuId: sku.id,
          enabled: existing?.isListed ?? false,
          price: existing?.priceOverride ?? sku.basePrice ?? "",
          // Prefill opening stock from the catalog default; only applied to newly enabled SKUs.
          // Existing mappings are left blank — see stock-field hint for why.
          stock: existing || sku.defaultInitialStock == null ? "" : String(sku.defaultInitialStock),
        };
      }
      return next;
    });
  }, [step, skusQuery.data, mappingsQuery.data]);

  const skus = (skusQuery.data?.data ?? []).filter((sku) => sku.status === "active");
  const mappedCount = Object.values(drafts).filter((d) => d.enabled).length;
  const totalCount = skus.length;

  const persistMappings = async (activate: boolean) => {
    if (!storeId) throw new Error("Store not created yet");

    const activeIds = new Set(skus.map((s) => s.id));
    const enabled = Object.values(drafts).filter((d) => d.enabled && activeIds.has(d.skuId));
    if (enabled.length > 0) {
      const reorderBySku = new Map(skus.map((s) => [s.id, s.defaultReorderPoint]));
      await bulkSkuMappingsApi(storeId, {
        mappings: enabled.map((d) => ({
          skuId: d.skuId,
          isListed: true,
          priceOverride: d.price.trim() === "" ? null : Number(d.price),
          reorderThreshold: reorderBySku.get(d.skuId) ?? 10,
        })),
      });

      // Stock field is additive (ledger stock-in), not a snapshot overwrite —
      // this applies whether the SKU is new to the store or already mapped.
      for (const d of enabled) {
        const qty = Number(d.stock);
        if (Number.isFinite(qty) && qty > 0) {
          await stockInApi(storeId, { skuId: d.skuId, quantity: qty, source: "onboarding" });
        }
      }
    }

    if (activate) {
      await activateStoreApi(storeId);
    }

    await queryClient.invalidateQueries({ queryKey: ["stores"] });
    await queryClient.invalidateQueries({ queryKey: ["stores", storeId, "sku-mappings"] });
    await queryClient.invalidateQueries({ queryKey: ["stores", storeId, "inventory"] });
  };

  const onCompleteSetup = async () => {
    setError(null);
    setSaving(true);
    try {
      await persistMappings(true);
      navigate({ to: "/admin/dark-stores" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete setup");
    } finally {
      setSaving(false);
    }
  };

  const onSaveDraftMappings = async () => {
    setError(null);
    setSaving(true);
    try {
      await persistMappings(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  const crumbLabel = isEdit ? "Edit Store" : "Add New Store";
  const title = isEdit ? `Edit "${storeName || "Dark Store"}"` : "Add New Dark Store";

  return (
    <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <div className="flex flex-col flex-1 -mx-8 -mb-8">
        <div className="flex-1 px-8">
          <PageHeader
            crumbs={[{ label: "Management" }, { label: "Dark Stores", to: "/admin/dark-stores" }, { label: crumbLabel }]}
            title={title}
            subtitle={
              step === 3 ? (
                <>
                  Configure localized inventory for{" "}
                  <span className="text-primary font-semibold">
                    &apos;{storeName || "New store"}&apos;
                  </span>
                </>
              ) : step === 2 ? (
                "Pin the store's exact location and set its delivery coverage radius."
              ) : isEdit ? (
                "Update this dark store's details, or jump to Inventory Mapping to manage its assigned products."
              ) : (
                "Register a new high-velocity fulfillment hub to the regional network."
              )
            }
            actions={
              step === 3 ? (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onSaveDraftMappings}
                    className="px-6 py-2 border border-outline-variant rounded-full text-sm hover:bg-surface-container-low disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onCompleteSetup}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold shadow-md shadow-primary/20 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Complete Setup"}
                  </button>
                </>
              ) : undefined
            }
          />

          {error && <p className="mb-4 text-sm text-destructive text-center">{error}</p>}

          <StepIndicator
            step={step}
            canJumpToMapping={Boolean(storeId)}
            onStepChange={(s) => {
              if (s === 3 && !storeId) return;
              setStep(s);
            }}
          />

          {step <= 2 ? (
            isEdit && storeQuery.isLoading ? (
              <p className="text-sm text-on-surface-variant text-center py-12">Loading store details…</p>
            ) : isEdit && storeQuery.error ? (
              <p className="text-sm text-destructive text-center py-12">Failed to load store details.</p>
            ) : (
              <StoreDetailsForm
                page={step === 1 ? "basic" : "location"}
                isEdit={isEdit}
                editStoreId={editStoreId}
                initialStore={storeQuery.data}
                onNext={() => setStep(2)}
                onBack={() => setStep(1)}
                onCreated={(store) => {
                  setStoreId(store.id);
                  setStoreName(store.name);
                  setStep(3);
                }}
                onError={setError}
              />
            )
          ) : (
            <InventoryMappingForm
              skus={skus}
              drafts={drafts}
              loading={skusQuery.isLoading}
              storeId={storeId!}
              existingMappingSkuIds={existingMappingSkuIds}
              inventoryBySkuId={inventoryBySkuId}
              onDraftChange={(skuId, patch) =>
                setDrafts((prev) => ({
                  ...prev,
                  [skuId]: { ...prev[skuId], ...patch },
                }))
              }
              onBulkImported={async () => {
                await mappingsQuery.refetch();
                await skusQuery.refetch();
              }}
              onImportError={setError}
            />
          )}
        </div>

        {step === 3 ? (
          <InventoryMappingFooter
            onBack={() => setStep(2)}
            mappedCount={mappedCount}
            totalCount={totalCount}
            saving={saving}
            onComplete={onCompleteSetup}
          />
        ) : (
          <CopyrightFooter />
        )}
      </div>
    </AppShell>
  );
}

function StepIndicator({
  step,
  canJumpToMapping,
  onStepChange,
}: {
  step: Step;
  canJumpToMapping: boolean;
  onStepChange: (s: Step) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 mb-10 max-w-3xl mx-auto">
      {STEPS.map((s, i) => {
        const completed = step > s.n;
        const active = step === s.n;
        const clickable = s.n <= 3 && (s.n <= 2 || canJumpToMapping);

        return (
          <div key={s.n} className="flex items-center gap-4">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepChange(s.n as Step)}
              className={`flex items-center gap-2 ${active ? "" : "opacity-70"} ${clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                  completed || active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {completed ? (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                ) : (
                  s.n
                )}
              </div>
              <span
                className={`font-semibold text-sm ${
                  active ? "text-primary" : completed ? "text-on-surface" : "text-on-surface-variant"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <div className="w-12 h-0.5 bg-outline-variant" />}
          </div>
        );
      })}
    </div>
  );
}

function CopyrightFooter() {
  return (
    <footer className="mt-auto px-8 py-5 border-t border-outline-variant bg-surface flex flex-wrap items-center justify-between gap-4 text-xs text-on-surface-variant">
      <p>© 2024 Velocity Commerce Systems • Global Network</p>
      <div className="flex items-center gap-4">
        <button type="button" className="hover:text-primary transition-colors">
          Privacy
        </button>
        <button type="button" className="hover:text-primary transition-colors">
          Status
        </button>
      </div>
    </footer>
  );
}

function InventoryMappingFooter({
  onBack,
  mappedCount,
  totalCount,
  saving,
  onComplete,
}: {
  onBack: () => void;
  mappedCount: number;
  totalCount: number;
  saving: boolean;
  onComplete: () => void;
}) {
  return (
    <footer className="mt-auto px-8 py-4 border-t border-outline-variant bg-surface flex flex-wrap items-center justify-between gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to Store Details
      </button>
      <div className="flex items-center gap-6">
        <p className="text-sm text-on-surface-variant">
          Products Mapped{" "}
          <span className="font-bold text-on-surface">
            {mappedCount} / {totalCount}
          </span>
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={onComplete}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Complete Setup"}
        </button>
      </div>
    </footer>
  );
}

function Field({
  label,
  placeholder,
  hint,
  span = 6,
  type = "text",
  suffix,
  value,
  onChange,
  required,
  min,
  step,
  maxLength,
  inputMode,
  list,
}: {
  label: string;
  placeholder?: string;
  hint?: string;
  span?: number;
  type?: string;
  suffix?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  min?: string;
  step?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  list?: string;
}) {
  const spanMap: Record<number, string> = {
    4: "md:col-span-4",
    6: "md:col-span-6",
    8: "md:col-span-8",
    12: "md:col-span-12",
  };
  return (
    <div className={`col-span-12 ${spanMap[span]}`}>
      <label className="block text-sm font-medium text-on-surface mb-2">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          min={min}
          step={step}
          maxLength={maxLength}
          inputMode={inputMode}
          list={list}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none ${
            suffix ? "pr-12" : ""
          }`}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">{suffix}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function StatusField({
  value,
  onChange,
}: {
  value: "active" | "maintenance";
  onChange: (v: "active" | "maintenance") => void;
}) {
  return (
    <div className="col-span-12">
      <label className="block text-sm font-medium text-on-surface mb-2">Status</label>
      <div className="flex gap-3">
        {(["active", "maintenance"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
              value === option
                ? "border-primary bg-primary/5 text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary/40"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                value === option ? "border-primary" : "border-outline"
              }`}
            >
              {value === option && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            {option === "active" ? "Active" : "Maintenance"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        Stores are created as <span className="font-semibold">onboarding</span>; activation happens after
        inventory mapping.
      </p>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min = 1,
  max = 20,
  unit = "km",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="col-span-12">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-on-surface">{label}</label>
        <span className="text-sm font-semibold text-primary">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-surface-container-high"
      />
    </div>
  );
}

function ToggleField({
  label,
  description,
  icon,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  icon?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="material-symbols-outlined text-on-surface-variant text-[20px] shrink-0">{icon}</span>
        )}
        <div>
          <p className="text-sm font-medium text-on-surface">{label}</p>
          {description && <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          on ? "bg-primary" : "bg-surface-container-high"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function ToggleSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="text-xs font-medium text-on-surface-variant">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
          on ? "bg-primary" : "bg-surface-container-high"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl border border-outline-variant p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-primary">{icon}</span>
        </div>
        <h3 className="text-lg font-bold text-on-surface">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StoreDetailsForm({
  page,
  isEdit,
  editStoreId,
  initialStore,
  onNext,
  onBack,
  onCreated,
  onError,
}: {
  /** Which page of the (still-unsubmitted) store form to render — state lives here regardless. */
  page: "basic" | "location";
  isEdit: boolean;
  editStoreId?: string;
  initialStore?: Store;
  onNext: () => void;
  onBack: () => void;
  onCreated: (store: { id: string; name: string }) => void;
  onError: (msg: string | null) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [statusIntent, setStatusIntent] = useState<"active" | "maintenance">("active");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("");
  // Kept as free-typed text (not number) so partial input like "-" or "51." isn't clobbered mid-keystroke.
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const lat = latText.trim() !== "" && Number.isFinite(Number(latText)) ? Number(latText) : null;
  const lng = lngText.trim() !== "" && Number.isFinite(Number(lngText)) ? Number(lngText) : null;
  const [coverageRadius, setCoverageRadius] = useState(5);
  const [dynamicRadius, setDynamicRadius] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [contact, setContact] = useState("");
  const [capacity, setCapacity] = useState("");
  const [coldStorage, setColdStorage] = useState(false);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [pendingResult, setPendingResult] = useState<{
    store: { id: string; name: string };
    mode: "continue" | "draft";
  } | null>(null);
  const invitedEmailRef = useRef("");
  const existingManagerStatus = initialStore?.managerStatus ?? null;
  // Suppresses auto-geocoding once the pin has been placed manually (map click/drag,
  // typed coordinates, or a store that already had coordinates saved) — typing a
  // typo-fix into the address afterward shouldn't silently yank the pin away.
  const pinManuallySetRef = useRef(false);
  const [geocodeStatus, setGeocodeStatus] = useState<
    "idle" | "locating" | "found-approximate" | "not-found" | "error"
  >("idle");
  // Guards against an earlier, slower lookup overwriting a more recent one's result.
  const geocodeRequestIdRef = useRef(0);

  const geocodeMutation = useMutation({
    mutationFn: (input: { street?: string; city?: string; postalCode?: string; country?: string }) =>
      geocodeAddressApi(input),
  });

  // Prefill once when the existing store loads (edit mode only); never again,
  // so it doesn't stomp on in-progress edits if the query refetches.
  useEffect(() => {
    if (!isEdit || !initialStore || prefilled) return;
    setName(initialStore.name);
    setCode(initialStore.code ?? "");
    setStreet(jsonString(initialStore.facility, "street") || initialStore.address);
    setCity(jsonString(initialStore.geofence, "city"));
    setPostal(jsonString(initialStore.geofence, "postalCode"));
    setCountry(jsonString(initialStore.geofence, "country"));
    const initialLat = jsonNumber(initialStore.geofence, "lat");
    const initialLng = jsonNumber(initialStore.geofence, "lng");
    setLatText(initialLat != null ? String(initialLat) : "");
    setLngText(initialLng != null ? String(initialLng) : "");
    pinManuallySetRef.current = initialLat != null && initialLng != null;
    setCoverageRadius(jsonNumber(initialStore.geofence, "radiusKm") ?? 5);
    setDynamicRadius(jsonBoolean(initialStore.geofence, "dynamicRadius"));
    setManagerName(initialStore.managerName ?? jsonString(initialStore.facility, "managerName"));
    setManagerEmail(initialStore.managerEmail ?? "");
    invitedEmailRef.current = (initialStore.managerEmail ?? "").trim().toLowerCase();
    setContact(jsonString(initialStore.facility, "contactNumber"));
    const capacityM3 = jsonNumber(initialStore.facility, "capacityM3");
    setCapacity(capacityM3 != null ? String(capacityM3) : "");
    setColdStorage(jsonBoolean(initialStore.facility, "coldStorage"));
    setOpenTime(jsonString(initialStore.operatingHours, "open"));
    setCloseTime(jsonString(initialStore.operatingHours, "close"));
    setStatusIntent(jsonString(initialStore.facility, "intendedStatus") === "maintenance" ? "maintenance" : "active");
    setPrefilled(true);
  }, [isEdit, initialStore, prefilled]);

  // Auto-geocode the typed address after a pause, unless the pin has already
  // been placed manually (dragged/clicked, typed coordinates, or loaded with
  // existing coordinates already saved). Requires at least a city or postal
  // code — street alone is too ambiguous to resolve anywhere in the world,
  // and the backend's own fallback chain needs one of these to fall back to.
  useEffect(() => {
    if (pinManuallySetRef.current) return;
    if (!city.trim() && !postal.trim()) return;

    setGeocodeStatus("locating");
    const requestId = ++geocodeRequestIdRef.current;

    const handle = setTimeout(() => {
      geocodeMutation.mutate(
        { street, city, postalCode: postal, country },
        {
          onSuccess: (result) => {
            // Ignore if superseded by a newer request or the pin was moved manually meanwhile.
            if (requestId !== geocodeRequestIdRef.current || pinManuallySetRef.current) return;
            setLatText(String(result.lat));
            setLngText(String(result.lng));
            setGeocodeStatus(result.precision === "approximate" ? "found-approximate" : "idle");
          },
          onError: (err) => {
            if (requestId !== geocodeRequestIdRef.current || pinManuallySetRef.current) return;
            setGeocodeStatus(err instanceof ApiError && err.status === 404 ? "not-found" : "error");
          },
        },
      );
    }, 900);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street, city, postal, country]);

  /** Marks the pin as manually placed so the address-typing effect stops overriding it. */
  const markPinManual = () => {
    pinManuallySetRef.current = true;
    setGeocodeStatus("idle");
  };

  const buildPayload = () => {
    const address = [street, city, postal, country].filter(Boolean).join(", ");
    return {
      name: name.trim(),
      code: code.trim() || undefined,
      address: address || street || "Address TBD",
      geofence: {
        type: "circle",
        radiusKm: coverageRadius,
        dynamicRadius,
        city,
        postalCode: postal,
        country,
        lat,
        lng,
      },
      operatingHours: { timezone: "local", open: openTime || undefined, close: closeTime || undefined },
      facility: {
        street,
        capacityM3: capacity ? Number(capacity) : null,
        coldStorage,
        contactNumber: contact || null,
        managerName: managerName || null,
        intendedStatus: statusIntent,
      },
      managerName: managerName || undefined,
    };
  };

  const saveMutation = useMutation({
    mutationFn: async (mode: "continue" | "draft") => {
      const payload = buildPayload();
      const store = isEdit ? await updateStoreApi(editStoreId!, payload) : await createStoreApi(payload);

      // Only (re)invite when the manager email actually changed — avoids
      // silently re-sending a setup link every time the admin hits save.
      const trimmedEmail = managerEmail.trim().toLowerCase();
      let invite: { inviteLink: string; emailSent: boolean } | null = null;
      if (trimmedEmail && trimmedEmail !== invitedEmailRef.current) {
        invite = await inviteManagerApi({
          email: trimmedEmail,
          name: managerName.trim() || "Store Manager",
          storeId: store.id,
        });
        invitedEmailRef.current = trimmedEmail;
      }

      return { store, mode, invite };
    },
    onSuccess: async ({ store, mode, invite }) => {
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      onError(null);

      if (invite) {
        setPendingResult({ store: { id: store.id, name: store.name }, mode });
        setInviteLinkCopied(false);
        setInviteEmailSent(invite.emailSent);
        setInviteLink(invite.inviteLink);
        return;
      }

      if (mode === "draft") {
        navigate({ to: "/admin/dark-stores" });
        return;
      }
      onCreated({ id: store.id, name: store.name });
    },
    onError: (err) => {
      onError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? "update" : "create"} store`);
    },
  });

  /** Advances from the Basic Info page to the Location & Logistics page — no network call yet. */
  const goToLocation = (e?: React.FormEvent) => {
    e?.preventDefault();
    onError(null);
    if (!name.trim()) {
      onError("Store name is required");
      return;
    }
    onNext();
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onError(null);
    if (!street.trim()) {
      onError("Street address is required");
      return;
    }
    if (managerEmail.trim() && !/^\S+@\S+\.\S+$/.test(managerEmail.trim())) {
      onError("Enter a valid manager email");
      return;
    }
    if (managerEmail.trim() && !managerName.trim()) {
      onError("Manager name is required when inviting a manager");
      return;
    }
    saveMutation.mutate("continue");
  };

  const saveDraft = () => {
    onError(null);
    if (!street.trim()) {
      onError("Street address is required to save a draft store");
      return;
    }
    saveMutation.mutate("draft");
  };

  const continueAfterInvite = () => {
    if (!pendingResult) return;
    setInviteLink(null);
    if (pendingResult.mode === "draft") {
      navigate({ to: "/admin/dark-stores" });
      return;
    }
    onCreated(pendingResult.store);
    setPendingResult(null);
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteLinkCopied(true);
  };

  if (inviteLink) {
    return (
      <div className="max-w-2xl mx-auto">
        <section className="bg-surface rounded-2xl border border-outline-variant p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[28px]">{inviteEmailSent ? "mark_email_read" : "mail"}</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface mb-1">
            {inviteEmailSent ? "Manager invited — email sent" : "Manager invited"}
          </h3>
          <p className="text-sm text-on-surface-variant mb-6">
            {inviteEmailSent ? (
              <>
                We've emailed a setup link to <span className="font-semibold">{managerEmail.trim()}</span>. It
                expires in 7 days. You can also copy the link below as a backup.
              </>
            ) : (
              <>
                Share this one-time setup link with <span className="font-semibold">{managerEmail.trim()}</span> — it
                expires in 7 days. Email isn't configured on this server yet, so send it yourself (Slack, WhatsApp,
                etc.).
              </>
            )}
          </p>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm font-mono truncate outline-none"
            />
            <button
              type="button"
              onClick={copyInviteLink}
              className="px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shrink-0"
            >
              {inviteLinkCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={continueAfterInvite}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-full text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            {pendingResult?.mode === "draft" ? "Done" : "Continue to Inventory"}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </section>
      </div>
    );
  }

  if (page === "basic") {
    return (
      <form className="grid grid-cols-12 gap-6" onSubmit={goToLocation}>
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <Card title="Basic Information" icon="info">
            <div className="grid grid-cols-12 gap-6">
              <Field
                label="Store Name"
                placeholder="e.g. Westside Hub B1"
                span={6}
                value={name}
                onChange={setName}
                required
                maxLength={80}
              />
              <Field
                label="Unique Store ID"
                placeholder="WH-B1-77291"
                span={6}
                value={code}
                onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))}
                maxLength={20}
              />
              <StatusField value={statusIntent} onChange={setStatusIntent} />
            </div>
          </Card>

          <Card title="Management & Staffing" icon="groups">
            <div className="grid grid-cols-12 gap-6">
              {isEdit && existingManagerStatus && (
                <div className="col-span-12 flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-4 py-2.5">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Current manager status: <span className="font-semibold capitalize">{existingManagerStatus}</span>.
                  Changing the email below invites a new manager and replaces the assignment.
                </div>
              )}
              <Field
                label="Manager Name"
                placeholder="e.g. Alex Thompson"
                span={6}
                value={managerName}
                onChange={setManagerName}
                maxLength={80}
              />
              <Field
                label="Manager Email"
                placeholder="manager@company.com"
                type="email"
                span={6}
                value={managerEmail}
                onChange={setManagerEmail}
                hint="They'll receive a one-time link to set their own password and log in as store manager."
              />
              <Field
                label="Contact Number"
                placeholder="+1 (555) 000-0000"
                span={6}
                value={contact}
                onChange={(v) => setContact(v.replace(/[^0-9+\-() ]/g, "").slice(0, 20))}
                maxLength={20}
                inputMode="tel"
              />
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="Operations" icon="warehouse">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-on-surface mb-2">Working Hours</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    aria-label="Opening time"
                    className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                  />
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    aria-label="Closing time"
                    className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-outline-variant">
                <Field
                  label="Capacity"
                  placeholder="2,500"
                  type="number"
                  min="0"
                  step="1"
                  suffix="m³"
                  span={12}
                  value={capacity}
                  onChange={setCapacity}
                />
              </div>
              <div className="pt-4 border-t border-outline-variant">
                <ToggleField
                  label="Cold Storage"
                  description="Dedicated unit"
                  on={coldStorage}
                  onChange={setColdStorage}
                />
              </div>
            </div>
          </Card>

          <section className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm space-y-3">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-full text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
            >
              Next: Location & Logistics
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
            <Link
              to="/admin/dark-stores"
              className="block w-full text-center py-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
            >
              Cancel & Return
            </Link>
          </section>
        </div>
      </form>
    );
  }

  return (
    <form className="grid grid-cols-12 gap-6" onSubmit={submit}>
      <div className="col-span-12 lg:col-span-8 space-y-6">
        <Card title="Location & Logistics" icon="location_on">
          <div className="grid grid-cols-12 gap-6">
            <Field
              label="Street Address"
              placeholder="123 Logistical Way"
              span={12}
              value={street}
              onChange={setStreet}
              required
              maxLength={120}
            />
            <Field
              label="City"
              placeholder="Metropolis"
              span={6}
              value={city}
              onChange={setCity}
              maxLength={60}
            />
            <Field
              label="Postal Code"
              placeholder="90210"
              span={6}
              value={postal}
              onChange={(v) => setPostal(v.slice(0, 10))}
              maxLength={10}
            />
            <Field
              label="Country"
              placeholder="e.g. India"
              span={6}
              value={country}
              onChange={setCountry}
              maxLength={60}
              list="country-options"
              hint="Scopes the map lookup so addresses resolve to the right country."
            />
            <datalist id="country-options">
              {COUNTRIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field
              label="Latitude"
              placeholder="51.5074"
              span={6}
              value={latText}
              onChange={(v) => {
                pinManuallySetRef.current = !(v.trim() === "" && lngText.trim() === "");
                setLatText(v);
              }}
            />
            <Field
              label="Longitude"
              placeholder="-0.1278"
              span={6}
              value={lngText}
              onChange={(v) => {
                pinManuallySetRef.current = !(v.trim() === "" && latText.trim() === "");
                setLngText(v);
              }}
            />
            <div className="col-span-12">
              <label className="block text-sm font-medium text-on-surface mb-2">Coverage Preview</label>
              <CoverageMap
                lat={lat}
                lng={lng}
                radiusKm={coverageRadius}
                onChange={(newLat, newLng) => {
                  markPinManual();
                  setLatText(String(newLat));
                  setLngText(String(newLng));
                }}
              />
              <p className="mt-1 text-xs text-on-surface-variant">
                {geocodeStatus === "locating"
                  ? "Locating address on the map…"
                  : geocodeStatus === "found-approximate"
                    ? "Located to the city/postal code area — drag the pin to the exact spot."
                    : geocodeStatus === "not-found"
                      ? "Couldn't find that address — click the map or type coordinates to set the pin."
                      : geocodeStatus === "error"
                        ? "Location lookup failed — click the map or type coordinates to set the pin."
                        : "Type an address above to locate it automatically, or click/drag the pin to set it manually."}
              </p>
            </div>
            <SliderField
              label="Coverage Radius (km)"
              value={coverageRadius}
              onChange={setCoverageRadius}
              min={1}
              max={20}
            />
            
          </div>
        </Card>
      </div>

      <div className="col-span-12 lg:col-span-4 space-y-6">
        <section className="bg-surface rounded-2xl border border-outline-variant p-6 shadow-sm space-y-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-full text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending
              ? "Saving…"
              : isEdit
                ? "Save Changes & Continue"
                : "Save & Continue"}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
          {!isEdit && (
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={saveDraft}
              className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-3.5 rounded-full text-sm font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">draft</span>
              Save as Draft
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Store Details
          </button>
          <Link
            to="/admin/dark-stores"
            className="block w-full text-center py-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
          >
            Cancel & Return
          </Link>
        </section>
      </div>
    </form>
  );
}

function ProductCard({
  sku,
  draft,
  hasExistingMapping,
  currentStock,
  onChange,
}: {
  sku: CatalogSku;
  draft: DraftRow;
  hasExistingMapping: boolean;
  currentStock: number | undefined;
  onChange: (patch: Partial<DraftRow>) => void;
}) {
  const stockLabel = hasExistingMapping ? "Add Stock" : "Stock";
  const stockPlaceholder = hasExistingMapping ? "0" : "0";

  return (
    <article className="bg-surface rounded-2xl border border-outline-variant p-5 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="w-14 h-14 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-center text-2xl shrink-0">
          {categoryGlyph(sku.category)}
        </div>
        <button type="button" className="p-1 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-[18px]">info</span>
        </button>
      </div>

      <span
        className={`inline-flex self-start px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider mb-2 ${categoryTone(sku.category)}`}
      >
        {(sku.category ?? "GENERAL").toUpperCase()}
      </span>

      <h4 className="text-sm font-bold text-on-surface leading-snug">{sku.name}</h4>
      <p className="text-xs text-on-surface-variant mt-0.5 mb-4">
        SKU: {sku.barcode ?? sku.id.slice(0, 8)}
      </p>

      <div className="mt-auto space-y-4">
        <ToggleSwitch
          label="Enable for Store"
          on={draft.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />

        {draft.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Price (£)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(e) => onChange({ price: e.target.value })}
                placeholder="0.00"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {stockLabel}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.stock}
                onChange={(e) => onChange({ stock: e.target.value })}
                placeholder={stockPlaceholder}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
              />
              {hasExistingMapping && (
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Current: {currentStock ?? 0} units{" "}
                  {Number(draft.stock) > 0 ? `→ adds ${Number(draft.stock)} more` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ImportBatchCard({
  storeId,
  onImported,
  onError,
}: {
  storeId: string;
  onImported: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    onError(null);
    setBusy(true);
    try {
      const csv = await file.text();
      await bulkSkuMappingsApi(storeId, { csv });
      await onImported();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "CSV import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed border-outline p-5 flex flex-col items-center justify-center text-center min-h-[260px] hover:border-primary hover:bg-primary/5 transition-colors group disabled:opacity-50"
      >
        <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
          <span className="material-symbols-outlined text-primary text-[24px]">
            {busy ? "hourglass_top" : "add"}
          </span>
        </div>
        <h4 className="text-sm font-bold text-on-surface">{busy ? "Importing…" : "Import Batch"}</h4>
        <p className="text-xs text-on-surface-variant mt-2 max-w-[180px] leading-relaxed">
          Upload a CSV to map products in bulk to this store.
        </p>
      </button>
    </>
  );
}

function InventoryMappingForm({
  skus,
  drafts,
  loading,
  storeId,
  existingMappingSkuIds,
  inventoryBySkuId,
  onDraftChange,
  onBulkImported,
  onImportError,
}: {
  skus: CatalogSku[];
  drafts: Record<string, DraftRow>;
  loading: boolean;
  storeId: string;
  existingMappingSkuIds: Set<string>;
  inventoryBySkuId: Map<string, number>;
  onDraftChange: (skuId: string, patch: Partial<DraftRow>) => void;
  onBulkImported: () => Promise<void>;
  onImportError: (msg: string | null) => void;
}) {
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("All Categories");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const sku of skus) {
      if (sku.category) set.add(sku.category);
    }
    return ["All Categories", ...Array.from(set).sort()];
  }, [skus]);

  const visibleSkus = skus.filter((sku) => {
    const draft = drafts[sku.id];
    if (showEnabledOnly && !draft?.enabled) return false;
    if (category !== "All Categories" && sku.category !== category) return false;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      const hay = `${sku.name} ${sku.brand ?? ""} ${sku.barcode ?? ""} ${sku.category ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-2xl border border-outline-variant p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              filter_list
            </span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by category, brand or SKU..."
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
            />
          </div>
          <div className="relative min-w-[160px]">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full appearance-none bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
              expand_more
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch on={showEnabledOnly} onChange={setShowEnabledOnly} />
            <span className="text-sm text-on-surface-variant whitespace-nowrap">Show Enabled Only</span>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-on-surface-variant">Loading catalog…</p>}

      {!loading && skus.length === 0 && (
        <p className="text-sm text-on-surface-variant">
          No SKUs in master catalog yet.{" "}
          <Link to="/admin/sku/new" className="text-primary font-semibold">
            Add a SKU
          </Link>{" "}
          first.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visibleSkus.map((sku) => {
          const draft = drafts[sku.id] ?? {
            skuId: sku.id,
            enabled: false,
            price: sku.basePrice,
            stock: "",
          };
          return (
            <ProductCard
              key={sku.id}
              sku={sku}
              draft={draft}
              hasExistingMapping={existingMappingSkuIds.has(sku.id)}
              currentStock={inventoryBySkuId.get(sku.id)}
              onChange={(patch) => onDraftChange(sku.id, patch)}
            />
          );
        })}
        <ImportBatchCard storeId={storeId} onImported={onBulkImported} onError={onImportError} />
      </div>
    </div>
  );
}
