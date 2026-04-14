"use client";

import type { EvSet } from "@/lib/types";

interface EvSetCardProps {
  set: EvSet;
  onClick: () => void;
}

export default function EvSetCard({ set, onClick }: EvSetCardProps) {
  const isMB2 = set.name.toLowerCase().includes("mystery booster 2");
  const isJumpstart = !isMB2 && (set.set_type === "draft_innovation" || set.name.toLowerCase().includes("jumpstart"));
  const playLabel = isJumpstart ? "Jumpstart" : isMB2 ? "Mystery" : "Play";
  const hasEv = set.play_ev_net != null || set.collector_ev_net != null;

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: "var(--surface-shadow)",
      }}
    >
      {/* Header: icon + name + code/date */}
      <div className="flex items-start gap-3 mb-3">
        {set.icon_svg_uri && (
          <img
            src={set.icon_svg_uri}
            alt={set.name}
            className="w-8 h-8"
            style={{ filter: "invert(0.9)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {set.name}
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {set.code.toUpperCase()} &middot;{" "}
            {new Date(set.released_at + "T00:00:00").toLocaleDateString("pt-PT")}
          </p>
        </div>
      </div>

      {/* Middle: EV badges or "Not configured" */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {set.config_exists ? (
          hasEv ? (
            <>
              {set.play_ev_net != null && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {playLabel}: &euro;{set.play_ev_net.toFixed(2)}
                </span>
              )}
              {set.collector_ev_net != null && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: "rgba(168, 85, 247, 0.15)",
                    color: "#a855f7",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Collector: &euro;{set.collector_ev_net.toFixed(2)}
                </span>
              )}
            </>
          ) : (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(34, 197, 94, 0.10)",
                color: "var(--success)",
              }}
            >
              Configured
            </span>
          )
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              color: "var(--text-muted)",
            }}
          >
            Not configured
          </span>
        )}
      </div>

      {/* Footer: cards count + set type — always at bottom */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {set.card_count} cards
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {set.set_type}
        </span>
      </div>
    </div>
  );
}
