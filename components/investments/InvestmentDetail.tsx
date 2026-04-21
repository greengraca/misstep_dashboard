"use client";

import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { InvestmentDetail as Detail } from "@/lib/investments/types";
import InvestmentKpiRow from "./InvestmentKpiRow";
import BaselineBanner from "./BaselineBanner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function InvestmentDetail({ id }: { id: string }) {
  const { data, isLoading } = useSWR<{ investment: Detail }>(
    `/api/investments/${id}`,
    fetcher,
    { dedupingInterval: 15_000 }
  );
  const detail = data?.investment;

  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!detail) return <div className="p-6 text-gray-500">Not found.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/investments" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <StatusPill status={detail.status} />
      </div>

      <BaselineBanner detail={detail} />
      <InvestmentKpiRow kpis={detail.kpis} />

      <div className="text-sm text-gray-600">
        Sealed flips, lots table, and close flow coming in the next tasks.
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Detail["status"] }) {
  const cls = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "listing") return <span className={`${cls} bg-indigo-100 text-indigo-700`}>listing</span>;
  if (status === "baseline_captured")
    return <span className={`${cls} bg-amber-100 text-amber-700`}>pending baseline</span>;
  if (status === "closed")
    return <span className={`${cls} bg-emerald-100 text-emerald-700`}>closed</span>;
  return <span className={`${cls} bg-gray-100 text-gray-600`}>archived</span>;
}
