import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/admin/sku/new")({
  component: AddSku,
});

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
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

function Field({ label, placeholder, type = "text", span = 6, hint }: any) {
  const spanMap: Record<number, string> = { 4: "md:col-span-4", 6: "md:col-span-6", 8: "md:col-span-8", 12: "md:col-span-12" };
  return (
    <div className={`col-span-12 ${spanMap[span]}`}>
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

function AddSku() {
  return (
    <AppShell role="admin" searchPlaceholder="Search catalog…">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          crumbs={[{ label: "Catalog" }, { label: "Master Catalog" }, { label: "Add SKU" }]}
          title="Add New Product SKU"
          subtitle="Fill in the technical and logistics details to register this product into the global catalog."
        />

        <form className="space-y-6">
          <Section title="Core Details" icon="info">
            <div className="grid grid-cols-12 gap-6">
              <Field label="Product Name" span={12} placeholder="e.g. Organic Oat Milk 1L" />
              <Field label="Brand" placeholder="Origins Co." />
              <Field label="Category" placeholder="Dairy Alternatives" />
              <Field label="SKU Code" placeholder="SKU-2210" />
              <Field label="Barcode / EAN" placeholder="5060283350427" />
              <div className="col-span-12">
                <label className="block text-xs font-semibold text-on-surface mb-2 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Short shelf-facing description…"
                  className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
            </div>
          </Section>

          <Section title="Logistics" icon="local_shipping">
            <div className="grid grid-cols-12 gap-6">
              <Field label="Weight (g)" type="number" placeholder="1050" span={4} />
              <Field label="Volume (cm³)" type="number" placeholder="1100" span={4} />
              <Field label="Case Pack" type="number" placeholder="12" span={4} />
              <Field label="Storage Zone" placeholder="Chilled 2–4°C" span={6} />
              <Field label="Shelf Life (days)" type="number" placeholder="14" span={6} />
            </div>
          </Section>

          <Section title="Pricing" icon="payments">
            <div className="grid grid-cols-12 gap-6">
              <Field label="Cost Price" placeholder="£1.10" />
              <Field label="List Price" placeholder="£2.40" />
              <Field label="Tax Class" placeholder="Standard (20%)" span={12} />
            </div>
          </Section>

          <div className="flex justify-end gap-3">
            <button type="button" className="px-6 py-3 rounded-full border border-outline-variant text-sm hover:bg-surface-container-low">
              Save as Draft
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">check</span>
              Publish SKU
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
