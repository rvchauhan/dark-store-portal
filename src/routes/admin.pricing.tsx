import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/admin/pricing")({
  component: () => (
    <AppShell role="admin">
      <PageHeader title="Pricing" subtitle="Regional price books and promotions" />
      <div className="bg-surface rounded-2xl border border-outline-variant p-10 text-center text-on-surface-variant">
        Pricing module — coming soon.
      </div>
    </AppShell>
  ),
});
