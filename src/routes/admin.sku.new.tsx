import { createFileRoute } from "@tanstack/react-router";
import { SkuForm } from "@/components/SkuForm";

export const Route = createFileRoute("/admin/sku/new")({
  component: () => <SkuForm />,
});
