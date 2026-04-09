"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvSet } from "@/lib/types";
import EvSetList from "./EvSetList";
import EvSetDetail from "./EvSetDetail";

export default function EvContent() {
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(null);

  const { data: setsData, isLoading } = useSWR<{ data: EvSet[] }>(
    "/api/ev/sets",
    fetcher
  );

  const sets = setsData?.data ?? [];
  const selectedSet = selectedSetCode ? sets.find((s) => s.code === selectedSetCode) ?? null : null;

  async function handleRefreshSets() {
    await fetch("/api/ev/sets?refresh=true");
    globalMutate("/api/ev/sets");
  }

  if (isLoading) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div className="skeleton" style={{ height: "48px", maxWidth: "400px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton" style={{ height: "140px" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {selectedSet ? (
        <EvSetDetail
          set={selectedSet}
          onBack={() => setSelectedSetCode(null)}
        />
      ) : (
        <EvSetList
          sets={sets}
          onSelectSet={setSelectedSetCode}
          onRefresh={handleRefreshSets}
        />
      )}
    </div>
  );
}
