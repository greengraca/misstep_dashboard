"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { EvSet, EvCalculationResult, EvConfig, EvSnapshot } from "@/lib/types";
import EvSummaryCards from "./EvSummaryCards";
import EvCardTable from "./EvCardTable";
import EvSlotBreakdown from "./EvSlotBreakdown";
import EvSimulationPanel from "./EvSimulationPanel";
import EvHistoryChart from "./EvHistoryChart";
import EvConfigModal from "./EvConfigModal";
import EvJumpstartThemes from "./EvJumpstartThemes";
import DiscountToggle from "@/components/dashboard/discount-toggle";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import { ArrowLeft, Settings, RefreshCw, Camera } from "lucide-react";

interface EvSetDetailProps {
  set: EvSet;
  onBack: () => void;
}

export default function EvSetDetail({ set, onBack }: EvSetDetailProps) {
  const isMB2 = set.name.toLowerCase().includes("mystery booster 2");
  // Detect Jumpstart by name only — set_type "draft_innovation" also covers
  // Modern Horizons, Commander Legends, Conspiracy, LOTR, etc., none of which
  // use Jumpstart boosters.
  const isJumpstart = !isMB2 && set.name.toLowerCase().includes("jumpstart");
  const boosterLabel = isJumpstart ? "Jumpstart Booster" : isMB2 ? "Mystery Booster" : undefined;
  const [boosterType, setBoosterType] = useState<"play" | "collector">("play");
  const [siftFloor, setSiftFloor] = useState(0.25);
  // Sets that combine with a Masterpiece subset (Zendikar Expeditions /
  // Kaladesh Inventions / Amonkhet Invocations). Mirrors masterpieceRefFor
  // in lib/ev.ts.
  const HAS_MASTERPIECES = ["bfz", "ogw", "kld", "aer", "akh", "hou"];
  const setHasMasterpieces = HAS_MASTERPIECES.includes(set.code.toLowerCase());
  const [includeMasterpieces, setIncludeMasterpieces] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ pct: number; phase: string } | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  // Sub-page tab — defaults to 'cards' (most-common drilldown). Persisted
  // per-tab in localStorage so the user lands back where they left off.
  const [innerTab, setInnerTab] = useState<"cards" | "simulation" | "history">("cards");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ev-set-detail-inner-tab");
    if (stored === "cards" || stored === "simulation" || stored === "history") {
      setInnerTab(stored);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ev-set-detail-inner-tab", innerTab);
  }, [innerTab]);

  // SWR hooks
  const masterpiecesParam = setHasMasterpieces && !includeMasterpieces ? "&masterpieces=off" : "";
  const { data: calcData, isLoading: calcLoading } = useSWR<{ data: EvCalculationResult; set_names?: Record<string, string> }>(
    `/api/ev/calculate/${set.code}?booster=${boosterType}&floor=${siftFloor}${masterpiecesParam}`,
    fetcher
  );
  const { data: configData, mutate: mutateConfig } = useSWR<{ data: EvConfig }>(
    `/api/ev/config/${set.code}`,
    fetcher
  );
  const { data: snapshotData, isLoading: snapshotsLoading, mutate: mutateSnapshots } = useSWR<{ data: EvSnapshot[] }>(
    `/api/ev/snapshots/${set.code}?days=90`,
    fetcher
  );

  const calcResult = calcData?.data ?? null;
  const config = configData?.data ?? null;
  const snapshots = snapshotData?.data ?? [];

  async function handleSyncCards() {
    setSyncing(true);
    setSyncProgress(null);
    try {
      const res = await fetch(`/api/ev/sets/${set.code}/sync`, { method: "POST" });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.pct !== undefined) setSyncProgress({ pct: msg.pct, phase: msg.phase || "" });
          } catch { /* skip malformed */ }
        }
      }
      globalMutate((key) => typeof key === "string" && (
        key.startsWith(`/api/ev/calculate/${set.code}`) ||
        key.startsWith(`/api/ev/jumpstart/${set.code}`)
      ));
      globalMutate(`/api/ev/sets/${set.code}/cards`);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  async function handleSaveConfig(updated: EvConfig) {
    setSaving(true);
    try {
      await fetch(`/api/ev/config/${set.code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sift_floor: updated.sift_floor,
          fee_rate: updated.fee_rate,
          play_booster: updated.play_booster,
          collector_booster: updated.collector_booster,
        }),
      });
      setSiftFloor(updated.sift_floor);
      mutateConfig();
      globalMutate((key) => typeof key === "string" && key.startsWith(`/api/ev/calculate/${set.code}`));
      setConfigOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSnapshot() {
    setSnapshotting(true);
    try {
      await fetch("/api/ev/snapshots/generate", { method: "POST" });
      mutateSnapshots();
      globalMutate("/api/ev/sets");
    } finally {
      setSnapshotting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          aria-label="Back to set list"
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={18} />
        </button>
        {set.icon_svg_uri && (
          <img src={set.icon_svg_uri} alt="" className="w-6 h-6" style={{ filter: "invert(0.9)" }} />
        )}
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {set.name}
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
          {set.code.toUpperCase()}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <DiscountToggle />
          <button
            onClick={handleGenerateSnapshot}
            disabled={snapshotting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px]"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", opacity: snapshotting ? 0.6 : 1 }}
          >
            <Camera size={12} className={snapshotting ? "animate-spin" : ""} />
            {snapshotting ? "Saving..." : "Snapshot"}
          </button>
          <button
            onClick={() => (syncing ? undefined : setConfirmSync(true))}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px]"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" }}
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncProgress ? `${syncProgress.pct}%` : syncing ? "Syncing..." : "Sync Cards"}
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px]"
            style={{ background: "var(--accent-light)", color: "var(--accent)" }}
          >
            <Settings size={12} />
            Configure
          </button>
        </div>
      </div>

      {isJumpstart ? (
        /* Jumpstart sets render their own panel; tabs concept doesn't apply.
           History stays at the bottom for parity with standard sets. */
        <>
          <EvJumpstartThemes setCode={set.code} siftFloor={siftFloor} />
          <EvHistoryChart snapshots={snapshots} isLoading={snapshotsLoading} boosterLabel={boosterLabel} />
        </>
      ) : (
        /* Standard sets: always show summary + slot breakdown, then tab
           between the deeper drilldowns to keep the page from being a
           5-panel scrolling wall. */
        <>
          <EvSummaryCards
            result={calcResult}
            isLoading={calcLoading}
            boosterType={boosterType}
            onBoosterTypeChange={setBoosterType}
            boosterLabel={boosterLabel}
            packsPerBox={calcResult?.packs_per_box ?? (boosterType === "play" ? config?.play_booster?.packs_per_box : config?.collector_booster?.packs_per_box)}
            cardsPerPack={calcResult?.cards_per_pack ?? (boosterType === "play" ? config?.play_booster?.cards_per_pack : config?.collector_booster?.cards_per_pack)}
            masterpiecesEnabled={setHasMasterpieces ? includeMasterpieces : undefined}
            onMasterpiecesChange={setHasMasterpieces ? setIncludeMasterpieces : undefined}
          />
          {calcResult && (
            <EvSlotBreakdown slots={calcResult.slot_breakdown} boxEvGross={calcResult.box_ev_gross} />
          )}

          {/* Sub-page tabs */}
          <div
            className="flex gap-0 overflow-x-auto overflow-y-hidden"
            style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}
          >
            {(["cards", "simulation", "history"] as const).map((t) => {
              const active = innerTab === t;
              const label = t === "cards" ? "Cards" : t === "simulation" ? "Simulation" : "History";
              return (
                <button
                  key={t}
                  onClick={() => setInnerTab(t)}
                  className="px-3 py-2 text-xs font-medium transition-all whitespace-nowrap"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: "-1px",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {innerTab === "cards" && (
            <>
              <EvCardTable cards={calcResult?.top_ev_cards ?? []} isLoading={calcLoading} setNames={calcData?.set_names} />
              <EvCardTable cards={calcResult?.top_price_cards ?? []} isLoading={calcLoading} title="Biggest Pulls" defaultSortKey="price" setNames={calcData?.set_names} />
            </>
          )}

          {innerTab === "simulation" && (
            <EvSimulationPanel
              setCode={set.code}
              boosterType={boosterType}
              siftFloor={siftFloor}
            />
          )}

          {innerTab === "history" && (
            <EvHistoryChart snapshots={snapshots} isLoading={snapshotsLoading} boosterLabel={boosterLabel} />
          )}
        </>
      )}

      {/* Config Modal */}
      {config && (
        <EvConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          config={config}
          onSave={handleSaveConfig}
          saving={saving}
          boosterLabel={boosterLabel}
        />
      )}

      <ConfirmModal
        open={confirmSync}
        onClose={() => setConfirmSync(false)}
        onConfirm={async () => {
          setConfirmSync(false);
          await handleSyncCards();
        }}
        title="Sync cards from Scryfall?"
        message="This re-fetches every card in this set from Scryfall and recomputes EV. The sync streams progress live and may take 30s+ for large sets. Local price overrides are preserved."
        confirmLabel="Sync cards"
        variant="default"
      />
    </div>
  );
}
