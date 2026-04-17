import { Suspense } from "react";
import StockContent from "@/components/stock/StockContent";

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockContent />
    </Suspense>
  );
}
