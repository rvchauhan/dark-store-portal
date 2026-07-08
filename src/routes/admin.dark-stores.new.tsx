import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/admin/dark-stores/new")({
  component: AddDarkStore,
});

function AddDarkStore() {
  const [step, setStep] = useState(1);
  return (
    <AppShell role="admin" primaryAction={{ label: "Add SKU", icon: "add", to: "/admin/sku/new" }}>
      <PageHeader
        crumbs={[{ label: "Management" }, { label: "Dark Stores" }, { label: "Add New Store" }]}
        title="Add New Dark Store"
        subtitle='Configure localized inventory for "East London Hub – DS04"'
        actions={
          <>
            <button className="px-6 py-2 border border-outline-variant rounded-full text-sm hover:bg-surface-container-low">
              Save Draft
            </button>
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold shadow-md shadow-primary/20">
              {step === 2 ? "Complete Setup" : "Continue"}
            </button>
          </>
        }
      />

      <div className="flex items-center justify-center gap-4 mb-10 max-w-2xl mx-auto">
        {[
          { n: 1, label: "Store Details" },
          { n: 2, label: "Inventory Mapping" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-4">
            <button
              onClick={() => setStep(s.n as 1 | 2)}
              className={`flex items-center gap-2 ${step === s.n ? "" : "opacity-60"}`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                  step >= s.n
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {s.n}
              </div>
              <span className={`font-semibold ${step === s.n ? "text-primary" : "text-on-surface-variant"}`}>
                {s.label}
              </span>
            </button>
            {i === 0 && <div className="w-16 h-0.5 bg-outline-variant" />}
          </div>
        ))}
      </div>

      {step === 1 ? <StoreDetailsForm /> : <InventoryMappingForm />}
    </AppShell>
  );
}

function Field({
  label,
  placeholder,
  hint,
  span = 6,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  hint?: string;
  span?: number;
  type?: string;
}) {
  return (
    <div className={`col-span-12 md:col-span-${span}`}>
      <label className="block text-xs font-semibold text-on-surface mb-2 uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
      />
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
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

function StoreDetailsForm() {
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-6">
        <Card title="Basic Information" icon="info">
          <div className="grid grid-cols-12 gap-6">
            <Field label="Store Name" placeholder="East London Hub" span={8} />
            <Field label="Store Code" placeholder="DS04" span={4} />
            <Field label="Region" placeholder="EMEA – UK South" span={6} />
            <Field label="Timezone" placeholder="Europe/London" span={6} />
          </div>
        </Card>
        <Card title="Location & Address" icon="location_on">
          <div className="grid grid-cols-12 gap-6">
            <Field label="Street Address" placeholder="14 Wharf Road" span={12} />
            <Field label="City" placeholder="London" span={4} />
            <Field label="Postcode" placeholder="E15 4QF" span={4} />
            <Field label="Country" placeholder="United Kingdom" span={4} />
          </div>
        </Card>
      </div>
      <div className="col-span-12 lg:col-span-4 space-y-6">
        <Card title="Capacity" icon="inventory">
          <div className="space-y-6">
            <Field label="Storage Slots" placeholder="1,200" type="number" span={12} />
            <Field label="Peak Order Capacity / hour" placeholder="180" type="number" span={12} />
          </div>
        </Card>
        <Card title="Manager" icon="person">
          <Field label="Assigned Manager" placeholder="Alex Thompson" span={12} />
        </Card>
      </div>
    </div>
  );
}

function InventoryMappingForm() {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-on-surface">Map SKUs to this store</h3>
          <p className="text-sm text-on-surface-variant">Select categories to auto-map, or add SKUs manually.</p>
        </div>
        <button className="px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold">
          + Add SKU
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {["Beverages", "Snacks", "Dairy", "Produce", "Frozen", "Personal Care", "Home", "Pet"].map((c) => (
          <label
            key={c}
            className="flex items-center gap-2 p-4 rounded-xl border border-outline-variant hover:border-primary cursor-pointer text-sm"
          >
            <input type="checkbox" className="rounded text-primary" />
            {c}
          </label>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-on-surface-variant uppercase tracking-wider bg-surface-container-low">
          <tr>
            <th className="px-4 py-3 text-left">SKU</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-left">Par Level</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {[
            ["SKU-1042", "Cold Brew 300ml", "Beverages", 60],
            ["SKU-2210", "Oat Milk 1L", "Dairy", 40],
            ["SKU-3341", "Salted Chips 200g", "Snacks", 120],
          ].map(([sku, name, cat, par]) => (
            <tr key={sku as string} className="hover:bg-surface-container-low">
              <td className="px-4 py-3 font-mono text-xs">{sku}</td>
              <td className="px-4 py-3">{name}</td>
              <td className="px-4 py-3 text-on-surface-variant">{cat}</td>
              <td className="px-4 py-3">{par}</td>
              <td className="px-4 py-3 text-right">
                <button className="text-on-surface-variant hover:text-destructive">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
