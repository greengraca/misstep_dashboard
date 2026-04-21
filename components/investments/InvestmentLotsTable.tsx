"use client";

import useSWR from "swr";
import { useState } from "react";
import { FoilStar } from "@/components/dashboard/cm-sprite";

type Lot = {
  id: string;
  cardmarket_id: number;
  foil: boolean;
  condition: string;
  language: string;
  name: string | null;
  set_code: string | null;
  qty_opened: number;
  qty_sold: number;
  qty_remaining: number;
  cost_basis_per_unit: number | null;
  proceeds_eur: number;
  live_price_eur: number | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function eur(n: number | null): string {
  return n == null ? "—" : `€${n.toFixed(2)}`;
}

export default function InvestmentLotsTable({ investmentId }: { investmentId: string }) {
  const [search, setSearch] = useState("");
  const [foil, setFoil] = useState<"all" | "foil" | "nonfoil">("all");
  const [minRemaining, setMinRemaining] = useState(0);

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (foil === "foil") qs.set("foil", "true");
  if (foil === "nonfoil") qs.set("foil", "false");
  if (minRemaining > 0) qs.set("minRemaining", String(minRemaining));

  const { data, isLoading } = useSWR<{ lots: Lot[] }>(
    `/api/investments/${investmentId}/lots?${qs.toString()}`,
    fetcher,
    { dedupingInterval: 10_000 }
  );
  const lots = data?.lots ?? [];

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Lot ledger</h2>
        <div className="flex items-center gap-2 text-sm">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={foil}
            onChange={(e) => setFoil(e.target.value as typeof foil)}
          >
            <option value="all">All</option>
            <option value="foil">Foil only</option>
            <option value="nonfoil">Non-foil only</option>
          </select>
          <input
            type="number"
            className="border rounded px-2 py-1 text-sm w-20"
            placeholder="Min rem."
            value={minRemaining}
            onChange={(e) => setMinRemaining(Number(e.target.value))}
          />
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : lots.length === 0 ? (
        <div className="text-sm text-gray-500">No lots yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-1">Card</th>
              <th>Cond.</th>
              <th>Lang.</th>
              <th className="text-right">Opened</th>
              <th className="text-right">Sold</th>
              <th className="text-right">Remaining</th>
              <th className="text-right">Cost/unit</th>
              <th className="text-right">Live</th>
              <th className="text-right">Rem. value</th>
              <th className="text-right">Proceeds</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const remValue =
                l.live_price_eur != null ? l.qty_remaining * l.live_price_eur : null;
              return (
                <tr key={l.id} className="border-b">
                  <td className="py-1">
                    <a
                      className="text-indigo-600 hover:underline"
                      href={`https://www.cardmarket.com/en/Magic/Products/Singles?idProduct=${l.cardmarket_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {l.name ?? `#${l.cardmarket_id}`}
                    </a>{" "}
                    {l.foil ? <FoilStar /> : null}
                  </td>
                  <td>{l.condition}</td>
                  <td>{l.language}</td>
                  <td className="text-right">{l.qty_opened}</td>
                  <td className="text-right">{l.qty_sold}</td>
                  <td className="text-right">{l.qty_remaining}</td>
                  <td className="text-right">{eur(l.cost_basis_per_unit)}</td>
                  <td className="text-right">{eur(l.live_price_eur)}</td>
                  <td className="text-right">{eur(remValue)}</td>
                  <td className="text-right">{eur(l.proceeds_eur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
