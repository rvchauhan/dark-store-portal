import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/admin/analytics")({
  component: () => (
    <AppShell role="admin">
      <PageHeader title="Analytics" subtitle="Cross-network performance & trends" />
      <div className="bg-surface rounded-2xl border border-outline-variant p-10 text-center text-on-surface-variant">
        Analytics dashboard — coming soon.
      </div>
    </AppShell>
  ),
});
