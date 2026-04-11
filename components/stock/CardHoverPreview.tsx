"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

// Module-level cache shared across all CardHoverPreview instances on the
// page. Keyed by `${name}|${set}` → image URL or null (not found).
const imageCache = new Map<string, string | null>();

interface CardHoverPreviewProps {
  name: string;
  set?: string;
}

export default function CardHoverPreview({ name, set }: CardHoverPreviewProps) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cacheKey = set ? `${name}|${set}` : name;

  const startHover = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOpen(true);
      if (imageCache.has(cacheKey)) {
        setImage(imageCache.get(cacheKey) ?? null);
        return;
      }
      setLoading(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const params = new URLSearchParams({ name });
      if (set) params.set("set", set);
      fetch(
        `/api/stock/card-image?${params.toString()}`,
        { signal: ctrl.signal }
      )
        .then((r) => r.json())
        .then((data: { image: string | null }) => {
          imageCache.set(cacheKey, data.image);
          setImage(data.image);
        })
        .catch(() => {
          setImage(null);
        })
        .finally(() => setLoading(false));
    }, 150);
  };

  const endHover = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setOpen(false);
    setLoading(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      <button
        type="button"
        aria-label={`Preview ${name}`}
        style={{
          background: "transparent",
          border: "none",
          padding: 4,
          cursor: "pointer",
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ImageIcon size={16} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            left: "100%",
            top: 0,
            marginLeft: 8,
            zIndex: 50,
            background: "var(--surface-gradient)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8,
            padding: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            minWidth: 160,
            minHeight: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading && (
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading…</span>
          )}
          {!loading && image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={name}
              style={{ width: 160, height: "auto", borderRadius: 6, display: "block" }}
            />
          )}
          {!loading && image === null && (
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No image</span>
          )}
        </div>
      )}
    </span>
  );
}
