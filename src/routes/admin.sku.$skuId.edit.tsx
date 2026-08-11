import { createFileRoute } from "@tanstack/react-router";
import { SkuForm } from "@/components/SkuForm";

export const Route = createFileRoute("/admin/sku/$skuId/edit")({
  component: EditSku,
});

function EditSku() {
  const { skuId } = Route.useParams();
  return <SkuForm skuId={skuId} />;
}
