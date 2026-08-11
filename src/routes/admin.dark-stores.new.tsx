import { createFileRoute } from "@tanstack/react-router";
import { DarkStoreWizard } from "@/components/DarkStoreWizard";

export const Route = createFileRoute("/admin/dark-stores/new")({
  component: () => <DarkStoreWizard />,
});
