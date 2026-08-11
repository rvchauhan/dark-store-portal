import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/AppShell";
import { createSkuApi, getCatalogMetaApi, getSkuApi, listSkusApi, updateSkuApi, uploadCatalogImageApi } from "@/lib/api";
import { ApiError, type CatalogSku, type SkuSpec, type SkuVariant, type VariantOption } from "@/lib/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_GALLERY_SLOTS = 4;
const MAX_SPECS = 30;
const MAX_NAME_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_ORG_FIELD_LENGTH = 60;
// Kept in sync with the equivalent constants in catalog.schemas.ts — numeric(10,2)
// caps out at 8 integer digits; weight/dimensions are sane real-world limits for a
// single retail SKU, not DB-driven.
const MONEY_MAX = 99_999_999.99;
const WEIGHT_MAX = 1_000;
const DIMENSION_MAX = 1_000;
const QTY_MAX = 1_000_000;
// No cap on the number of variant *options* (Size, Color, ...) — the real risk is the
// generated matrix (their cartesian product) getting large enough to freeze the tab
// or exceed the server's variants[].max(200). Guard on that instead.
const MAX_GENERATED_VARIANTS = 200;
type SkuStatus = "draft" | "active" | "archived";

/** Strips everything but digits and a single decimal point — no minus sign, no letters, no "e". */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

/** Strips everything but digits — for whole-unit counts (stock, reorder point). */
function sanitizeInt(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * Sanitizes to a decimal AND clamps the numeric value to `maxValue`. Text inputs
 * ignore the native `max` attribute entirely, so this is the only real enforcement —
 * without it, `max`/`min` on a number input only affects the spinner/validity API,
 * never what a user can actually type.
 */
function clampDecimal(v: string, maxValue: number): string {
  const cleaned = sanitizeDecimal(v);
  if (cleaned === "" || cleaned === ".") return cleaned;
  return Number(cleaned) > maxValue ? String(maxValue) : cleaned;
}

/** Same as `clampDecimal` but for whole-unit counts. */
function clampInt(v: string, maxValue: number): string {
  const cleaned = sanitizeInt(v);
  if (cleaned === "") return cleaned;
  return Number(cleaned) > maxValue ? String(maxValue) : cleaned;
}

/** Keys that shadow a structured field — mirrors the server-side denylist in catalog.schemas.ts. */
const RESERVED_SPEC_KEYS = new Set([
  "name",
  "brand",
  "category",
  "barcode",
  "price",
  "baseprice",
  "compareatprice",
  "costprice",
  "taxrate",
  "currency",
  "unitofmeasure",
  "skucode",
  "weight",
  "weightkg",
  "dimensions",
  "dimensionscm",
  "description",
  "status",
  "images",
]);

function normalizeSpecKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** Per-row message, or null if the row is fine (or blank and about to be dropped on submit). */
function specRowErrors(specs: SkuSpec[]): (string | null)[] {
  const seen = new Set<string>();
  return specs.map((spec) => {
    const key = spec.key.trim();
    const value = spec.value.trim();
    if (!key && !value) return null;
    if (!key || !value) return "Both a field name and value are required";
    const normalized = normalizeSpecKey(key);
    if (RESERVED_SPEC_KEYS.has(normalized)) return `"${key}" duplicates a built-in product field`;
    if (seen.has(normalized)) return `Duplicate spec key "${key}"`;
    seen.add(normalized);
    return null;
  });
}

const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "INR", symbol: "₹" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" },
  { code: "JPY", symbol: "¥" },
  { code: "CNY", symbol: "¥" },
  { code: "AED", symbol: "د.إ" },
  { code: "SGD", symbol: "S$" },
] as const;

/** Free-typed "Size, values" input kept separate from the parsed VariantOption so a
 *  trailing comma or half-typed word while typing doesn't get silently dropped. */
type OptionDraft = { name: string; valuesText: string };

function parseOptionDraft(draft: OptionDraft): VariantOption | null {
  const name = draft.name.trim();
  const values = [...new Set(draft.valuesText.split(",").map((v) => v.trim()).filter(Boolean))];
  return name && values.length > 0 ? { name, values } : null;
}

/** Stable key for matching a variant matrix row across re-renders regardless of key order. */
function optionKey(options: Record<string, string>): string {
  return Object.keys(options)
    .sort()
    .map((k) => `${k}:${options[k]}`)
    .join("|");
}

/** How many variant rows `cartesianOptions` would generate, without building the array. */
function comboCount(options: VariantOption[]): number {
  if (options.length === 0) return 0;
  return options.reduce((acc, opt) => acc * opt.values.length, 1);
}

/** Cartesian product of every option's values — one entry per generated variant row. */
function cartesianOptions(options: VariantOption[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>((acc, opt) => {
    if (acc.length === 0) return opt.values.map((v) => ({ [opt.name]: v }));
    const next: Record<string, string>[] = [];
    for (const combo of acc) {
      for (const v of opt.values) next.push({ ...combo, [opt.name]: v });
    }
    return next;
  }, []);
}

/** Returns an error message, or null if the file is an acceptable product image. */
function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name}: only PNG, JPG or WEBP images are allowed`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name}: exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`;
  }
  return null;
}

/** An image slot is either an already-uploaded URL (edit mode) or a freshly picked local file. */
type ImageSlot = { kind: "existing"; url: string } | { kind: "new"; file: File; preview: string };

function slotPreview(slot: ImageSlot): string {
  return slot.kind === "existing" ? slot.url : slot.preview;
}

function Section({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-surface rounded-lg border border-outline-variant">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-outline-variant">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-lg border border-outline-variant">
      <div className="px-5 py-4 border-b border-outline-variant">
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: SkuStatus | "unsaved" }) {
  const styles: Record<string, string> = {
    active: "bg-primary/10 text-primary",
    draft: "bg-surface-container-high text-on-surface-variant",
    archived: "bg-surface-container-high text-on-surface-variant",
    unsaved: "bg-surface-container-high text-on-surface-variant",
  };
  const label = status === "unsaved" ? "Unsaved" : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${styles[status]}`}>{label}</span>
  );
}

function Field({
  id,
  label,
  placeholder,
  type = "text",
  span = 6,
  value,
  onChange,
  suffix,
  readOnly,
  required,
  min,
  max,
  step,
  maxLength,
  showCount,
  inputMode,
  error,
  hint,
}: {
  id?: string;
  label: string;
  placeholder?: string;
  type?: string;
  span?: number;
  value?: string;
  onChange?: (v: string) => void;
  suffix?: React.ReactNode;
  readOnly?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
  /** Shows a live "n/maxLength" counter under the field — only meaningful with maxLength set. */
  showCount?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  error?: string;
  hint?: string;
}) {
  const spanMap: Record<number, string> = {
    3: "md:col-span-3",
    4: "md:col-span-4",
    6: "md:col-span-6",
    12: "md:col-span-12",
  };
  return (
    <div id={id} className={`col-span-12 ${spanMap[span] ?? "md:col-span-6"}`}>
      <label className="block text-sm font-medium text-on-surface mb-2">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          inputMode={inputMode}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full bg-surface border rounded-xl px-4 py-3 text-sm focus:ring-4 outline-none ${
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/10"
              : "border-outline-variant focus:border-primary focus:ring-primary/10"
          } ${suffix ? "pr-12" : ""} ${readOnly ? "bg-surface-container-low text-on-surface-variant" : ""}`}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">{suffix}</div>
        )}
      </div>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!error && hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
        </div>
        {showCount && maxLength && (
          <p className="text-xs text-on-surface-variant shrink-0">
            {(value ?? "").length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Select fed by live catalog values, with an "Add new…" escape hatch that
 * swaps to a free-text input so admins can introduce new brands/categories.
 */
function ComboField({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(false);

  return (
    <div className="col-span-12 md:col-span-6">
      <label className="block text-sm font-medium text-on-surface mb-2">{label}</label>
      {custom ? (
        <div className="flex items-stretch gap-2">
          <input
            autoFocus
            type="text"
            placeholder={`New ${label.toLowerCase()}…`}
            value={value}
            maxLength={MAX_ORG_FIELD_LENGTH}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 min-w-0 bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
          />
          <button
            type="button"
            title="Back to list"
            onClick={() => {
              setCustom(false);
              onChange("");
            }}
            className="px-3 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
        </div>
      ) : (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustom(true);
                onChange("");
              } else {
                onChange(e.target.value);
              }
            }}
            className="w-full appearance-none bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
          >
            <option value="" disabled>
              {placeholder}
            </option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value="__custom__">＋ Add new…</option>
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
            expand_more
          </span>
        </div>
      )}
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: SkuStatus; onChange: (v: SkuStatus) => void }) {
  return (
    <div className="col-span-12 md:col-span-6">
      <label className="block text-sm font-medium text-on-surface mb-2">Status</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SkuStatus)}
          className="w-full appearance-none bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
          expand_more
        </span>
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">
        Archived SKUs can no longer be assigned to new stores.
      </p>
    </div>
  );
}

function DescriptionEditor({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (before: string, after = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const tools: { icon: string; title: string; apply: () => void }[] = [
    { icon: "format_bold", title: "Bold", apply: () => wrapSelection("**") },
    { icon: "format_italic", title: "Italic", apply: () => wrapSelection("*") },
    { icon: "format_list_bulleted", title: "Bullet list", apply: () => wrapSelection("\n- ", "") },
    { icon: "link", title: "Link", apply: () => wrapSelection("[", "](url)") },
  ];

  return (
    <div className="border border-outline-variant rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-outline-variant bg-surface-container-low">
        {tools.map((tool) => (
          <button
            key={tool.icon}
            type="button"
            title={tool.title}
            onClick={tool.apply}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">{tool.icon}</span>
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        rows={4}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter detailed product specifications, ingredients, and marketing copy..."
        className="w-full bg-surface px-4 py-3 text-sm outline-none resize-y"
      />
    </div>
  );
}

function LogisticsToggle({
  icon,
  iconClass,
  label,
  description,
  on,
  onChange,
}: {
  icon: string;
  iconClass: string;
  label: string;
  description: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-outline-variant rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-on-surface">{label}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>
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

function CurrencySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="col-span-12 md:col-span-2">
      <label className="block text-sm font-medium text-on-surface mb-2">Currency</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-surface border border-outline-variant rounded-xl px-3 py-3 text-sm text-on-surface focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
          expand_more
        </span>
      </div>
    </div>
  );
}

function OptionEditor({
  index,
  draft,
  onChange,
  onDelete,
}: {
  index: number;
  draft: OptionDraft;
  onChange: (next: OptionDraft) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-on-surface">Option {index + 1}</p>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs font-semibold text-destructive hover:underline"
        >
          Delete
        </button>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-5">
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Option name</label>
          <input
            type="text"
            value={draft.name}
            placeholder="e.g. Size"
            maxLength={40}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
          />
        </div>
        <div className="col-span-12 md:col-span-7">
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            Option values (comma-separated)
          </label>
          <input
            type="text"
            value={draft.valuesText}
            placeholder="e.g. Small, Medium, Large"
            onChange={(e) => onChange({ ...draft, valuesText: e.target.value })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function SpecRow({
  spec,
  error,
  onChange,
  onDelete,
}: {
  spec: SkuSpec;
  error?: string | null;
  onChange: (next: SkuSpec) => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          type="text"
          value={spec.key}
          placeholder="e.g. Processor"
          maxLength={40}
          onChange={(e) => onChange({ ...spec, key: e.target.value })}
          className={`flex-1 min-w-0 bg-surface border rounded-lg px-3 py-2.5 text-sm focus:ring-2 outline-none ${
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/10"
              : "border-outline-variant focus:border-primary focus:ring-primary/10"
          }`}
        />
        <input
          type="text"
          value={spec.value}
          placeholder="e.g. Intel i8"
          maxLength={200}
          onChange={(e) => onChange({ ...spec, value: e.target.value })}
          className={`flex-1 min-w-0 bg-surface border rounded-lg px-3 py-2.5 text-sm focus:ring-2 outline-none ${
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/10"
              : "border-outline-variant focus:border-primary focus:ring-primary/10"
          }`}
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete spec"
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-destructive"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function VariantMatrix({
  variants,
  currencySymbol,
  onChange,
}: {
  variants: SkuVariant[];
  currencySymbol: string;
  onChange: (index: number, patch: Partial<SkuVariant>) => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Variant</th>
            <th className="px-4 py-3 text-left font-semibold">Price</th>
            <th className="px-4 py-3 text-left font-semibold">Barcode</th>
            <th className="px-4 py-3 text-left font-semibold">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {variants.map((v, i) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">
                {Object.values(v.options).join(" / ")}
              </td>
              <td className="px-4 py-3">
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={11}
                    placeholder="0.00"
                    value={v.price ?? ""}
                    onChange={(e) => {
                      const cleaned = clampDecimal(e.target.value, MONEY_MAX);
                      onChange(i, { price: cleaned === "" ? undefined : Number(cleaned) });
                    }}
                    className="w-full pl-6 pr-2 py-2 bg-surface border border-outline-variant rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
                  />
                </div>
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={v.barcode ?? ""}
                  placeholder="Barcode"
                  maxLength={14}
                  onChange={(e) => onChange(i, { barcode: e.target.value.replace(/\D/g, "").slice(0, 14) || undefined })}
                  className="w-32 px-3 py-2 bg-surface border border-outline-variant rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="0"
                  value={v.stock ?? ""}
                  onChange={(e) => {
                    const cleaned = clampInt(e.target.value, QTY_MAX);
                    onChange(i, { stock: cleaned === "" ? undefined : Number(cleaned) });
                  }}
                  className="w-24 px-3 py-2 bg-surface border border-outline-variant rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductMedia({
  primaryPreview,
  onPrimaryFile,
  galleryPreviews,
  onGalleryFile,
  onRemoveGallery,
}: {
  primaryPreview: string | null;
  onPrimaryFile: (file: File) => void;
  galleryPreviews: string[];
  onGalleryFile: (file: File) => void;
  onRemoveGallery: (index: number) => void;
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-7">
        <p className="text-sm font-medium text-on-surface mb-2">Primary Image</p>
        <input
          ref={primaryInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPrimaryFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => primaryInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onPrimaryFile(file);
          }}
          className={`w-full h-56 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center transition-colors overflow-hidden ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-outline-variant bg-surface-container-low hover:border-primary/60"
          }`}
        >
          {primaryPreview ? (
            <img src={primaryPreview} alt="Primary product" className="w-full h-full object-contain" />
          ) : (
            <>
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant">
                upload_file
              </span>
              <p className="text-sm font-medium text-on-surface">Drag &amp; Drop or Click to Upload</p>
              <p className="text-xs text-on-surface-variant">
                PNG, JPG or WEBP (Max {MAX_IMAGE_BYTES / (1024 * 1024)}MB)
              </p>
            </>
          )}
        </button>
      </div>

      <div className="col-span-12 md:col-span-5">
        <p className="text-sm font-medium text-on-surface mb-2">
          Gallery Slots ({galleryPreviews.length}/{MAX_GALLERY_SLOTS})
        </p>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onGalleryFile(file);
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: MAX_GALLERY_SLOTS }, (_, i) => {
            const preview = galleryPreviews[i];
            return preview ? (
              <div
                key={i}
                className="relative h-26 rounded-xl border border-outline-variant overflow-hidden group"
              >
                <img src={preview} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveGallery(i)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove gallery image ${i + 1}`}
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="h-26 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:border-primary/60"
                aria-label={`Add gallery image to slot ${i + 1}`}
              >
                <span className="material-symbols-outlined text-[22px]">add_photo_alternate</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Add / Edit SKU form.
 *
 * Two entry points share this component:
 *   - /admin/sku/new          (no skuId — create flow)
 *   - /admin/sku/$skuId/edit  (skuId — edit flow, prefilled)
 */
export function SkuForm({ skuId }: { skuId?: string }) {
  const isEdit = Boolean(skuId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [initialStock, setInitialStock] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [barcode, setBarcode] = useState("");
  const [internalSkuId, setInternalSkuId] = useState("");
  const [fragile, setFragile] = useState(false);
  const [coldStorage, setColdStorage] = useState(false);
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [status, setStatus] = useState<SkuStatus>("draft");
  const [primarySlot, setPrimarySlot] = useState<ImageSlot | null>(null);
  const [gallerySlots, setGallerySlots] = useState<ImageSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [optionDrafts, setOptionDrafts] = useState<OptionDraft[]>([]);
  const [variants, setVariants] = useState<SkuVariant[]>([]);
  const [specs, setSpecs] = useState<SkuSpec[]>([]);
  const specErrors = useMemo(() => specRowErrors(specs), [specs]);
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";

  const parsedOptions = useMemo(
    () => optionDrafts.map(parseOptionDraft).filter((o): o is VariantOption => o !== null),
    [optionDrafts],
  );
  const generatedVariantCount = useMemo(() => comboCount(parsedOptions), [parsedOptions]);
  const variantsOverLimit = generatedVariantCount > MAX_GENERATED_VARIANTS;

  // Regenerate the variant matrix whenever the options change, preserving existing
  // price/barcode/stock for combinations that still exist and dropping ones that don't.
  // Skipped entirely over the limit — building the full cartesian product of, say,
  // 6 options x 20 values each (64M rows) would freeze the tab.
  useEffect(() => {
    if (variantsOverLimit) return;
    const combos = cartesianOptions(parsedOptions);
    setVariants((prev) => {
      const byKey = new Map(prev.map((v) => [optionKey(v.options), v]));
      return combos.map((options) => {
        const existing = byKey.get(optionKey(options));
        if (existing) return existing;
        return {
          id: crypto.randomUUID(),
          options,
          price: parseNum(basePrice),
          stock: parseNum(initialStock) !== undefined ? Math.floor(Number(initialStock)) : undefined,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(parsedOptions)]);

  const metaQuery = useQuery({ queryKey: ["catalog", "meta"], queryFn: getCatalogMetaApi });
  const brandOptions = [...new Set(metaQuery.data?.brands ?? [])].sort();
  const categoryOptions = [...new Set(metaQuery.data?.categories ?? [])].sort();

  const skuQuery = useQuery({
    queryKey: ["catalog", "skus", skuId],
    queryFn: () => getSkuApi(skuId!),
    enabled: isEdit,
  });

  // Full catalog, used only for client-side barcode/SKU-code duplicate hints.
  const catalogQuery = useQuery({ queryKey: ["catalog", "skus"], queryFn: () => listSkusApi() });
  const allSkus = catalogQuery.data?.data ?? [];
  const barcodeTaken =
    barcode.trim() !== "" && allSkus.some((s) => s.barcode === barcode.trim() && s.id !== skuId);
  const skuCodeTaken =
    internalSkuId.trim() !== "" && allSkus.some((s) => s.skuCode === internalSkuId.trim() && s.id !== skuId);

  // Prefill once when the existing SKU loads (edit mode only).
  useEffect(() => {
    const sku: CatalogSku | undefined = skuQuery.data;
    if (!isEdit || !sku || prefilled) return;
    setName(sku.name);
    setBrand(sku.brand ?? "");
    setCategory(sku.category ?? "");
    setDescription(sku.description ?? "");
    setBasePrice(sku.basePrice ?? "");
    setCurrency(sku.currency || "USD");
    setCompareAtPrice(sku.compareAtPrice ?? "");
    setCostPrice(sku.costPrice ?? "");
    setTaxRate(sku.taxRate ?? "");
    setAllowBackorder(sku.allowBackorder);
    setInitialStock(sku.defaultInitialStock != null ? String(sku.defaultInitialStock) : "");
    setReorderPoint(String(sku.defaultReorderPoint ?? 10));
    setBarcode(sku.barcode ?? "");
    setInternalSkuId(sku.skuCode ?? "");
    setFragile(sku.isFragile);
    setColdStorage(sku.requiresColdStorage);
    setWeight(sku.weightKg ?? "");
    setDimL(sku.dimensionsCm ? String(sku.dimensionsCm.length) : "");
    setDimW(sku.dimensionsCm ? String(sku.dimensionsCm.width) : "");
    setDimH(sku.dimensionsCm ? String(sku.dimensionsCm.height) : "");
    setStatus(sku.status);
    setOptionDrafts(
      (sku.variantOptions ?? []).map((opt) => ({ name: opt.name, valuesText: opt.values.join(", ") })),
    );
    setVariants(sku.variants ?? []);
    setSpecs(sku.specs ?? []);
    const images = sku.images ?? [];
    setPrimarySlot(images[0] ? { kind: "existing", url: images[0] } : null);
    setGallerySlots(images.slice(1).map((url) => ({ kind: "existing", url }) as ImageSlot));
    setPrefilled(true);
  }, [isEdit, skuQuery.data, prefilled]);

  const generateSkuId = () => {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInternalSkuId(`SKU-${suffix}`);
  };

  const pickImage = (file: File, assign: (slot: ImageSlot) => void) => {
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    assign({ kind: "new", file, preview: URL.createObjectURL(file) });
  };

  const parseNum = (v: string) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const basePriceNum = parseNum(basePrice);
  const compareAtPriceNum = parseNum(compareAtPrice);
  const costPriceNum = parseNum(costPrice);
  // A "was" price only makes sense struck-through above the current selling price.
  const compareAtInvalid =
    compareAtPriceNum !== undefined && basePriceNum !== undefined && compareAtPriceNum <= basePriceNum;
  // Not blocked — loss-leader pricing is a legitimate choice — just surfaced so it's not a typo.
  const sellingAtLoss =
    costPriceNum !== undefined && basePriceNum !== undefined && costPriceNum > basePriceNum;
  const barcodeInvalid = barcode.trim() !== "" && barcode.trim().length < 8;

  // Only surfaced once the admin has tried to save — showing "required" errors on a
  // blank fresh form before they've typed anything reads as nagging, not helpful.
  const nameError = submitAttempted && !name.trim() ? "Product name is required" : undefined;
  const priceError = submitAttempted && basePriceNum === undefined ? "Selling price is required" : undefined;

  const mutation = useMutation({
    mutationFn: async (targetStatus: SkuStatus) => {
      const slots = [primarySlot, ...gallerySlots].filter((s): s is ImageSlot => s !== null);
      const images = await Promise.all(
        slots.map((slot) => (slot.kind === "existing" ? slot.url : uploadCatalogImageApi(slot.file).then((r) => r.url))),
      );

      const length = parseNum(dimL);
      const width = parseNum(dimW);
      const height = parseNum(dimH);
      const dimensionsCm =
        length !== undefined && width !== undefined && height !== undefined
          ? { length, width, height }
          : undefined;

      const payload = {
        name: name.trim(),
        brand: brand.trim() || undefined,
        category: category.trim() || undefined,
        barcode: barcode.trim() || undefined,
        basePrice: parseNum(basePrice) ?? 0,
        currency,
        compareAtPrice: parseNum(compareAtPrice),
        costPrice: parseNum(costPrice),
        taxRate: parseNum(taxRate) ?? 0,
        allowBackorder,
        unitOfMeasure: "each",
        skuCode: internalSkuId.trim() || undefined,
        isFragile: fragile,
        requiresColdStorage: coldStorage,
        weightKg: parseNum(weight),
        dimensionsCm,
        defaultReorderPoint: parseNum(reorderPoint) !== undefined ? Math.floor(Number(reorderPoint)) : undefined,
        defaultInitialStock: parseNum(initialStock) !== undefined ? Math.floor(Number(initialStock)) : undefined,
        variantOptions: parsedOptions,
        variants,
        description: description.trim() || undefined,
        specs: specs
          .map((s) => ({ key: s.key.trim(), value: s.value.trim() }))
          .filter((s) => s.key && s.value),
        images,
      };

      // Create only ever fires with "draft"/"active" (the two create-mode buttons);
      // "archived" is only reachable via the edit-mode Status select.
      return isEdit
        ? updateSkuApi(skuId!, { ...payload, status: targetStatus })
        : createSkuApi({ ...payload, status: targetStatus === "archived" ? "active" : targetStatus });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      navigate({ to: "/admin/master-catalog" });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? "update" : "create"} SKU`);
      requestAnimationFrame(() => {
        document.getElementById("form-error-banner")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
  });

  // Representative "has the admin actually typed anything" check — good enough to
  // decide whether Discard needs a confirmation, without diffing every field.
  const isDirty =
    name.trim() !== "" ||
    basePrice.trim() !== "" ||
    description.trim() !== "" ||
    barcode.trim() !== "" ||
    primarySlot !== null ||
    gallerySlots.length > 0 ||
    optionDrafts.length > 0 ||
    specs.length > 0;

  /**
   * Catches every way a filled-in form could be abandoned — the Discard link, a sidebar
   * nav click, a breadcrumb, and (via TanStack Router's history wiring) the browser's
   * own Back/Forward buttons — not just one button. Disabled once the save actually
   * succeeds so the post-save redirect to the catalog list doesn't trigger it too.
   */
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => isDirty && !mutation.isSuccess,
    enableBeforeUnload: isDirty && !mutation.isSuccess,
    withResolver: true,
  });

  /**
   * Every blocking check, in roughly the order fields appear on the page. Each maps to
   * the id of the field/section that shows its own inline error — on failure we scroll
   * there instead of just showing one generic banner the user has to hunt for.
   */
  const validationOrder: { id: string; invalid: boolean }[] = [
    { id: "field-name", invalid: !name.trim() },
    { id: "field-price", invalid: basePriceNum === undefined },
    { id: "field-compare-at", invalid: compareAtInvalid },
    { id: "field-barcode", invalid: barcodeTaken || barcodeInvalid },
    { id: "field-sku-code", invalid: skuCodeTaken },
    { id: "section-variants", invalid: variantsOverLimit },
    { id: "section-specs", invalid: specErrors.some(Boolean) },
  ];

  const submit = (targetStatus: SkuStatus) => {
    setError(null);
    setSubmitAttempted(true);

    const firstInvalid = validationOrder.find((v) => v.invalid);
    if (firstInvalid) {
      document.getElementById(firstInvalid.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    mutation.mutate(targetStatus);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(isEdit ? status : "active");
  };

  const title = isEdit ? "Edit Product" : "Add New Product";
  const crumbLabel = isEdit ? "Edit SKU" : "Add SKU";

  if (isEdit && skuQuery.isLoading) {
    return (
      <AppShell role="admin" searchPlaceholder="Search catalog…">
        <p className="text-sm text-on-surface-variant text-center py-12">Loading SKU details…</p>
      </AppShell>
    );
  }

  if (isEdit && skuQuery.error) {
    return (
      <AppShell role="admin" searchPlaceholder="Search catalog…">
        <p className="text-sm text-destructive text-center py-12">Failed to load this SKU.</p>
      </AppShell>
    );
  }

  return (
    <AppShell role="admin" searchPlaceholder="Search catalog…">
      <div className="flex flex-col flex-1 -mx-8 -mb-8">
        <div className="flex-1 px-8">
          <PageHeader
            crumbs={[{ label: "Catalog" }, { label: "Master Catalog", to: "/admin/master-catalog" }, { label: crumbLabel }]}
            title={title}
            badge={<StatusBadge status={isEdit ? status : "unsaved"} />}
            subtitle={
              isEdit
                ? "Update this product's catalog, pricing, and logistics details."
                : "Fill in the technical and logistics details to register this product into the global catalog."
            }
          />

          <form id="sku-form" onSubmit={onSubmit}>
            <div className="grid grid-cols-12 gap-6 pb-8">
              <div className="col-span-12 lg:col-span-8 min-w-0 space-y-5">
                <Section title="Title and description">
                  <div className="space-y-4">
                    <Field
                      id="field-name"
                      label="Title"
                      span={12}
                      placeholder="e.g. Organic Almond Milk 1L"
                      value={name}
                      onChange={setName}
                      required
                      maxLength={MAX_NAME_LENGTH}
                      showCount
                      error={nameError}
                    />
                    <div>
                      <label className="block text-sm font-medium text-on-surface mb-2">Description</label>
                      <DescriptionEditor
                        value={description}
                        onChange={setDescription}
                        maxLength={MAX_DESCRIPTION_LENGTH}
                      />
                      <p className="mt-1 text-xs text-on-surface-variant text-right">
                        {description.length}/{MAX_DESCRIPTION_LENGTH}
                      </p>
                    </div>
                  </div>
                </Section>

                <Section title="Media" subtitle="Add images so store staff can identify what they're picking.">
                  <ProductMedia
                    primaryPreview={primarySlot ? slotPreview(primarySlot) : null}
                    onPrimaryFile={(file) => pickImage(file, setPrimarySlot)}
                    galleryPreviews={gallerySlots.map(slotPreview)}
                    onGalleryFile={(file) =>
                      pickImage(file, (slot) =>
                        setGallerySlots((prev) => (prev.length < MAX_GALLERY_SLOTS ? [...prev, slot] : prev)),
                      )
                    }
                    onRemoveGallery={(index) =>
                      setGallerySlots((prev) => prev.filter((_, i) => i !== index))
                    }
                  />
                </Section>

                <Section title="Pricing">
                  <div className="grid grid-cols-12 gap-6">
                    <CurrencySelect value={currency} onChange={setCurrency} />
                    <Field
                      id="field-price"
                      label="Price"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      span={3}
                      value={basePrice}
                      onChange={(v) => setBasePrice(clampDecimal(v, MONEY_MAX))}
                      required
                      maxLength={11}
                      suffix={currencySymbol}
                      error={priceError}
                    />
                    <Field
                      id="field-compare-at"
                      label="Compare-at price"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      span={3}
                      value={compareAtPrice}
                      onChange={(v) => setCompareAtPrice(clampDecimal(v, MONEY_MAX))}
                      maxLength={11}
                      suffix={currencySymbol}
                      error={compareAtInvalid ? "Must be higher than the selling price" : undefined}
                      hint="Shown struck-through. Leave blank for no markdown."
                    />
                    <Field
                      label="Cost per item"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      span={2}
                      value={costPrice}
                      onChange={(v) => setCostPrice(clampDecimal(v, MONEY_MAX))}
                      maxLength={11}
                      suffix={currencySymbol}
                      hint={sellingAtLoss ? "Sells at a loss" : undefined}
                    />
                    <Field
                      label="Tax rate"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      span={2}
                      value={taxRate}
                      onChange={(v) => setTaxRate(clampDecimal(v, 100))}
                      maxLength={6}
                      suffix="%"
                    />
                  </div>
                </Section>

                <Section title="Inventory">
                  <div className="grid grid-cols-12 gap-6">
                    <Field
                      label="Initial stock"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      span={6}
                      value={initialStock}
                      onChange={(v) => setInitialStock(clampInt(v, QTY_MAX))}
                      maxLength={7}
                    />
                    <Field
                      label="Reorder point"
                      type="text"
                      inputMode="numeric"
                      placeholder="10"
                      span={6}
                      value={reorderPoint}
                      onChange={(v) => setReorderPoint(clampInt(v, QTY_MAX))}
                      maxLength={7}
                    />
                    <div className="col-span-12 pt-2 border-t border-outline-variant">
                      <LogisticsToggle
                        icon="sell"
                        iconClass="bg-emerald-100 text-emerald-600"
                        label="Continue selling when out of stock"
                        description="Keep this SKU listed even at zero available quantity."
                        on={allowBackorder}
                        onChange={setAllowBackorder}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Shipping">
                  <div className="space-y-4">
                    <LogisticsToggle
                      icon="warning"
                      iconClass="bg-amber-100 text-amber-600"
                      label="Fragile item"
                      description="Requires protective packaging during fulfillment."
                      on={fragile}
                      onChange={setFragile}
                    />
                    <LogisticsToggle
                      icon="ac_unit"
                      iconClass="bg-sky-100 text-sky-600"
                      label="Cold storage required"
                      description="Maintain between 2°C and 8°C in transit and storage."
                      on={coldStorage}
                      onChange={setColdStorage}
                    />
                    <div className="grid grid-cols-12 gap-6 pt-2 border-t border-outline-variant">
                      <Field
                        label="Weight"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        span={4}
                        value={weight}
                        onChange={(v) => setWeight(clampDecimal(v, WEIGHT_MAX))}
                        maxLength={8}
                        suffix="kg"
                      />
                      <div className="col-span-12 md:col-span-8">
                        <label className="block text-sm font-medium text-on-surface mb-2">
                          Dimensions L x W x H (cm)
                        </label>
                        <div className="flex gap-3">
                          {(
                            [
                              ["L", dimL, setDimL],
                              ["W", dimW, setDimW],
                              ["H", dimH, setDimH],
                            ] as const
                          ).map(([ph, val, set]) => (
                            <input
                              key={ph}
                              type="text"
                              inputMode="decimal"
                              placeholder={ph}
                              value={val}
                              maxLength={8}
                              onChange={(e) => set(clampDecimal(e.target.value, DIMENSION_MAX))}
                              className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm text-center focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>

                <Section
                  id="section-variants"
                  title="Variants"
                  subtitle="Add options like size or color to create multiple variants."
                  actions={
                    optionDrafts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOptionDrafts((prev) => [...prev, { name: "", valuesText: "" }])}
                        className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Add option
                      </button>
                    )
                  }
                >
                  <div className="space-y-4">
                    {optionDrafts.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setOptionDrafts([{ name: "", valuesText: "" }])}
                        className="w-full flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary/60 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        Add options like size or color
                      </button>
                    )}

                    {optionDrafts.map((draft, i) => (
                      <OptionEditor
                        key={i}
                        index={i}
                        draft={draft}
                        onChange={(next) =>
                          setOptionDrafts((prev) => prev.map((d, idx) => (idx === i ? next : d)))
                        }
                        onDelete={() => setOptionDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                      />
                    ))}

                    {variantsOverLimit && (
                      <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                        These options would generate {generatedVariantCount} variants — reduce options or
                        values so the total stays at {MAX_GENERATED_VARIANTS} or fewer.
                      </p>
                    )}

                    {parsedOptions.length > 0 && !variantsOverLimit && (
                      <div>
                        <p className="text-sm font-medium text-on-surface mb-2">
                          Variant matrix ({variants.length} variant{variants.length === 1 ? "" : "s"})
                        </p>
                        <VariantMatrix
                          variants={variants}
                          currencySymbol={currencySymbol}
                          onChange={(i, patch) =>
                            setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
                          }
                        />
                      </div>
                    )}
                  </div>
                </Section>

                <Section
                  id="section-specs"
                  title="Specifications"
                  subtitle="Free-form spec sheet shown to store staff and customers — e.g. Processor, Material."
                  actions={
                    specs.length < MAX_SPECS && (
                      <button
                        type="button"
                        onClick={() => setSpecs((prev) => [...prev, { key: "", value: "" }])}
                        className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Add spec
                      </button>
                    )
                  }
                >
                  <div className="space-y-3">
                    {specs.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setSpecs([{ key: "", value: "" }])}
                        className="w-full flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary/60 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        Add a spec like Processor or Material
                      </button>
                    )}

                    {specs.map((spec, i) => (
                      <SpecRow
                        key={i}
                        spec={spec}
                        error={specErrors[i]}
                        onChange={(next) => setSpecs((prev) => prev.map((s, idx) => (idx === i ? next : s)))}
                        onDelete={() => setSpecs((prev) => prev.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </div>
                </Section>

                {error && (
                  <p id="form-error-banner" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                    {error}
                  </p>
                )}
              </div>

              <div className="col-span-12 lg:col-span-4 space-y-5">
                <SidebarSection title="Organization">
                  <ComboField
                    label="Brand"
                    placeholder="Select brand"
                    options={brandOptions}
                    value={brand}
                    onChange={setBrand}
                  />
                  <ComboField
                    label="Category"
                    placeholder="Select category"
                    options={categoryOptions}
                    value={category}
                    onChange={setCategory}
                  />
                </SidebarSection>

                <SidebarSection title="Identification">
                  <Field
                    id="field-barcode"
                    label="UPC / EAN barcode"
                    placeholder="8-14 digit barcode"
                    span={12}
                    value={barcode}
                    onChange={(v) => setBarcode(v.replace(/\D/g, "").slice(0, 14))}
                    maxLength={14}
                    inputMode="numeric"
                    error={
                      barcodeTaken
                        ? "Already used by another SKU in your catalog"
                        : barcodeInvalid
                          ? "Must be at least 8 digits"
                          : undefined
                    }
                    suffix={<span className="material-symbols-outlined text-[20px]">barcode_scanner</span>}
                  />
                  <div id="field-sku-code">
                    <label className="block text-sm font-medium text-on-surface mb-2">Internal SKU ID</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        readOnly
                        placeholder="Auto-generated"
                        value={internalSkuId}
                        className={`flex-1 min-w-0 bg-surface-container-low border rounded-xl px-4 py-3 text-sm text-on-surface-variant outline-none ${
                          skuCodeTaken ? "border-destructive" : "border-outline-variant"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={generateSkuId}
                        className="px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shrink-0"
                      >
                        Generate
                      </button>
                    </div>
                    {skuCodeTaken && (
                      <p className="mt-1 text-xs text-destructive">
                        Already used by another SKU — generate a new one.
                      </p>
                    )}
                  </div>
                </SidebarSection>

                {isEdit && (
                  <SidebarSection title="Status">
                    <StatusSelect value={status} onChange={setStatus} />
                  </SidebarSection>
                )}
              </div>
            </div>
          </form>
        </div>

        <footer className="mt-auto px-8 py-4 border-t border-outline-variant bg-surface flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/admin/master-catalog"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
            Discard
          </Link>
          <div className="flex items-center gap-3">
            {!isEdit && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => submit("draft")}
                className="px-6 py-2.5 rounded-full border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
              >
                {mutation.isPending && mutation.variables === "draft" ? "Saving…" : "Save as draft"}
              </button>
            )}
            <button
              type="submit"
              form="sku-form"
              disabled={mutation.isPending}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 flex items-center gap-2 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">check</span>
              {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Save product"}
            </button>
          </div>
        </footer>
      </div>

      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) navigationBlocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this product. If you leave now, they&apos;ll be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigationBlocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => navigationBlocker.proceed?.()}
            >
              Leave page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
