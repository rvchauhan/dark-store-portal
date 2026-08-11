import { createFileRoute } from "@tanstack/react-router";
import { DarkStoreWizard } from "@/components/DarkStoreWizard";

export const Route = createFileRoute("/admin/dark-stores/$storeId/edit")({
  validateSearch: (search: Record<string, unknown>): { step: 1 | 2 | 3 } => ({
    step: search.step === 2 ? 2 : search.step === 3 ? 3 : 1,
  }),
  component: EditDarkStore,
});

function EditDarkStore() {
  const { storeId } = Route.useParams();
  const { step } = Route.useSearch();
  return <DarkStoreWizard storeId={storeId} initialStep={step} />;
}
