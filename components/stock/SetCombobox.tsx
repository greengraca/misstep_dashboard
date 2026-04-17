"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SetMap, SetMeta } from "./StockTable";

interface SetComboboxProps {
  value: string;
  onChange: (next: string) => void;
  setMap?: SetMap;
  setNames: string[];
}

interface Option {
  cmName: string;
  code: string;
  displayName: string;
  iconSvgUri?: string;
  haystack: string;
}

function buildOptions(setNames: string[], setMap: SetMap | undefined): Option[] {
  return setNames
    .map((cmName) => {
      const meta: SetMeta | undefined = setMap?.[cmName];
      return {
        cmName,
        code: meta?.code ?? "",
        displayName: meta?.name ?? cmName,
        iconSvgUri: meta?.iconSvgUri,
        haystack: `${cmName} ${meta?.name ?? ""} ${meta?.code ?? ""}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function SetCombobox({
  value,
  onChange,
  setMap,
  setNames,
}: SetComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const options = useMemo(() => buildOptions(setNames, setMap), [setNames, setMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 200);
    return options
      .filter((o) => o.haystack.includes(q))
      .slice(0, 200);
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (next: string) => {
    onChange(next);
    setQuery(next);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        commit(filtered[highlight].cmName);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "var(--text-primary)",
          padding: "6px 8px",
          fontSize: 13,
          minWidth: 0,
          width: "100%",
        }}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="name or code (e.g. J25)"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear set"
          onClick={() => commit("")}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      )}
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: "auto",
            background: "#111",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            zIndex: 60,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {filtered.map((o, i) => (
            <div
              key={o.cmName}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o.cmName);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
                background:
                  i === highlight ? "rgba(255,255,255,0.08)" : "transparent",
                color: "var(--text-primary)",
              }}
            >
              {o.iconSvgUri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.iconSvgUri}
                  alt=""
                  width={12}
                  height={12}
                  style={{ filter: "invert(1)", flexShrink: 0 }}
                />
              )}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.displayName}
              </span>
              {o.code && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {o.code}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
