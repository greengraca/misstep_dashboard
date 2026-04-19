import EvProductDetail from "@/components/ev/EvProductDetail";

export default async function EvProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EvProductDetail slug={slug} />;
}
