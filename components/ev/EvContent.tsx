"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvSet } from "@/lib/types";
import EvSetList from "./EvSetList";
import EvSetDetail from "./EvSetDetail";
import EvProductList from "./EvProductList";
import DiscountToggle from "@/components/dashboard/discount-toggle";

type TabKey = "sets" | "products";

export default function EvContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab: TabKey = searchParams.get("view") === "products" ? "products" : "sets";
  const initialSet = searchParams.get("set");
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(initialSet);

  // Keep ?view= and ?set= in sync with component state.
  useEffect(() => {
    const currentView = searchParams.get("view");
    const currentSet = searchParams.get("set");
    const desiredView = tab === "products" ? "products" : null;
    const desiredSet = tab === "sets" && selectedSetCode ? selectedSetCode : null;
    if (currentView === desiredView && currentSet === desiredSet) return;
    const params = new URLSearchParams(searchParams.toString());
    if (desiredView) params.set("view", desiredView);
    else params.delete("view");
    if (desiredSet) params.set("set", desiredSet);
    else params.delete("set");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [tab, selectedSetCode, pathname, router, searchParams]);

  const { data: setsData, isLoading } = useSWR<{ data: EvSet[] }>(
    "/api/ev/sets",
    fetcher
  );
  const sets = setsData?.data ?? [];
  const selectedSet = selectedSetCode
    ? sets.find((s) => s.code === selectedSetCode) ?? null
    : null;

  async function handleRefreshSets() {
    await fetch("/api/ev/sets?refresh=true");
    globalMutate("/api/ev/sets");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Discount toggle — global, persists across pages via localStorage */}
      <div className="flex justify-end">
        <DiscountToggle />
      </div>

      {/* Tab strip — hidden when a set detail is open */}
      {!selectedSet && (
        <div
          className="flex gap-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {(["sets", "products"] as TabKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="px-4 py-2 text-sm capitalize transition-colors"
              style={{
                background: "none",
                border: "none",
                borderBottom:
                  tab === k ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === k ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: tab === k ? 600 : 400,
                cursor: "pointer",
                marginBottom: "-1px",
              }}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {tab === "sets" ? (
        selectedSet ? (
          <EvSetDetail set={selectedSet} onBack={() => setSelectedSetCode(null)} />
        ) : isLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: "140px" }} />
            ))}
          </div>
        ) : (
          <EvSetList
            sets={sets}
            onSelectSet={setSelectedSetCode}
            onRefresh={handleRefreshSets}
          />
        )
      ) : (
        <EvProductList />
      )}
    </div>
  );
}
