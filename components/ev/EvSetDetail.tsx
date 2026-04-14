"use client";

import { useState } from "react";
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
import { ArrowLeft, Settings, RefreshCw, Camera } from "lucide-react";

interface EvSetDetailProps {
  set: EvSet;
  onBack: () => void;
}

export default function EvSetDetail({ set, onBack }: EvSetDetailProps) {
  const isMB2 = set.name.toLowerCase().includes("mystery booster 2");
  const isJumpstart = !isMB2 && (set.set_type === "draft_innovation" || set.name.toLowerCase().includes("jumpstart"));
  const boosterLabel = isJumpstart ? "Jumpstart Booster" : isMB2 ? "Mystery Booster" : undefined;
  const [boosterType, setBoosterType] = useState<"play" | "collector">("play");
  const [siftFloor, setSiftFloor] = useState(0.25);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ pct: number; phase: string } | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);

  // SWR hooks
  const { data: calcData, isLoading: calcLoading } = useSWR<{ data: EvCalculationResult }>(
    `/api/ev/calculate/${set.code}?booster=${boosterType}&floor=${siftFloor}`,
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
          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleGenerateSnapshot}
            disabled={snapshotting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", opacity: snapshotting ? 0.6 : 1 }}
          >
            <Camera size={12} className={snapshotting ? "animate-spin" : ""} />
            {snapshotting ? "Saving..." : "Snapshot"}
          </button>
          <button
            onClick={handleSyncCards}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" }}
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncProgress ? `${syncProgress.pct}%` : syncing ? "Syncing..." : "Sync Cards"}
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent)" }}
          >
            <Settings size={12} />
            Configure
          </button>
        </div>
      </div>

      {isJumpstart ? (
        /* Jumpstart: theme-based EV */
        <EvJumpstartThemes setCode={set.code} siftFloor={siftFloor} />
      ) : (
        /* Standard: slot-based EV */
        <>
          <EvSummaryCards
            result={calcResult}
            isLoading={calcLoading}
            boosterType={boosterType}
            onBoosterTypeChange={setBoosterType}
            boosterLabel={boosterLabel}
            packsPerBox={boosterType === "play" ? config?.play_booster?.packs_per_box : config?.collector_booster?.packs_per_box}
            cardsPerPack={boosterType === "play" ? config?.play_booster?.cards_per_pack : config?.collector_booster?.cards_per_pack}
          />
          {calcResult && (
            <EvSlotBreakdown slots={calcResult.slot_breakdown} boxEvGross={calcResult.box_ev_gross} />
          )}
          <EvCardTable cards={calcResult?.top_ev_cards ?? []} isLoading={calcLoading} />
          <EvCardTable cards={calcResult?.top_price_cards ?? []} isLoading={calcLoading} title="Biggest Pulls" defaultSortKey="price" />
          <EvSimulationPanel
            setCode={set.code}
            boosterType={boosterType}
            siftFloor={siftFloor}
          />
        </>
      )}

      {/* History — shown for both */}
      <EvHistoryChart snapshots={snapshots} isLoading={snapshotsLoading} boosterLabel={boosterLabel} />

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
    </div>
  );
}
