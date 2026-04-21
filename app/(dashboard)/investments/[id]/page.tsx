import InvestmentDetail from "@/components/investments/InvestmentDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvestmentDetail id={id} />;
}
