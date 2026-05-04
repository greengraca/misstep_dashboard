"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { FoilStar } from "@/components/dashboard/cm-sprite";

export interface SellableCardOption {
  cardmarket_id: number;
  name: string;
  set_name: string | null;
  rarity: string | null;
  foil_default: boolean;
  lot_remaining: number | null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

interface Props {
  investmentId: string;
  selected: SellableCardOption | null;
  onSelect: (card: SellableCardOption) => void;
  /** Visual override when the parent wants the picker to look "locked" after
   *  a selection. We still allow re-selection by clicking the input. */
  disabled?: boolean;
}

export default function ManualSaleCardPicker({ investmentId, selected, onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 200);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{ rows: SellableCardOption[] }>(
    open ? `/api/investments/${investmentId}/sellable-cards?q=${encodeURIComponent(debounced)}` : null,
    fetcher,
    { dedupingInterval: 5_000, keepPreviousData: true }
  );
  const rows = data?.rows ?? [];

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const displayValue = selected ? selected.name : query;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="relative flex items-center"
        style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)" }}
      >
        <Search size={12} style={{ color: "var(--text-muted)", position: "absolute", left: 10 }} />
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Search by card name…"
          className="w-full bg-transparent text-sm py-2 pl-8 pr-3 outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg shadow-lg z-50"
          style={{
            background: "rgba(15, 20, 25, 0.98)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          }}
        >
          {isLoading && rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Searching…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
              {debounced ? "No matches." : "Start typing to search the set, or pick from existing lots below."}
            </div>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.cardmarket_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(row);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{row.name}</span>
                      {row.foil_default && <FoilStar />}
                      {row.rarity && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          · {row.rarity}
                        </span>
                      )}
                    </span>
                    {row.lot_remaining != null && (
                      <span
                        className="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(74, 222, 128, 0.10)", color: "#4ade80" }}
                      >
                        Tracked: {row.lot_remaining} remaining
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
