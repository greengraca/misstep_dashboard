"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";

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
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; placement: "right" | "modal" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const cacheKey = set ? `${name}|${set}` : name;

  function loadImage() {
    if (imageCache.has(cacheKey)) {
      setImage(imageCache.get(cacheKey) ?? null);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const params = new URLSearchParams({ name });
    if (set) params.set("set", set);
    fetch(`/api/stock/card-image?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: { image: string | null }) => {
        imageCache.set(cacheKey, data.image);
        setImage(data.image);
      })
      .catch(() => {
        setImage(null);
      })
      .finally(() => setLoading(false));
  }

  function computePosition(): { top: number; left: number; placement: "right" | "modal" } {
    // On narrow viewports (where there's no horizontal room for a side
    // popover) fall back to a centered modal-style overlay. 480 px is the
    // threshold below which the existing 160 px image + gutter would clip.
    if (typeof window === "undefined" || window.innerWidth < 480 || !triggerRef.current) {
      return { top: 0, left: 0, placement: "modal" };
    }
    const rect = triggerRef.current.getBoundingClientRect();
    return { top: rect.top, left: rect.right + 8, placement: "right" };
  }

  const startHover = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPopoverPos(computePosition());
      setOpen(true);
      loadImage();
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

  // Tap support — clicking the icon toggles the preview. Works on both
  // mouse (overrides hover-then-leave race) and touch devices, where
  // hover events don't fire at all.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      endHover();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setPopoverPos(computePosition());
    setOpen(true);
    loadImage();
  };

  // Close the modal-mode preview on Escape or backdrop tap.
  useEffect(() => {
    if (!open || popoverPos?.placement !== "modal") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, popoverPos]);

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
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        aria-label={`Preview ${name}`}
        style={{
          background: "transparent",
          border: "none",
          padding: 6,
          cursor: "pointer",
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ImageIcon size={16} />
      </button>
      {open && popoverPos?.placement === "right" && (
        <div
          style={{
            position: "fixed",
            top: popoverPos.top,
            left: popoverPos.left,
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
          <PreviewBody loading={loading} image={image} name={name} />
        </div>
      )}
      {open && popoverPos?.placement === "modal" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--bg-modal)" }}
          onClick={(e) => {
            // Backdrop tap closes — but tapping the image itself shouldn't.
            if (e.target === e.currentTarget) {
              endHover();
            }
          }}
        >
          <div
            className="relative"
            style={{
              background: "var(--surface-gradient)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              padding: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <button
              onClick={endHover}
              aria-label="Close preview"
              className="absolute top-1 right-1 inline-flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ background: "rgba(0,0,0,0.5)", color: "var(--text-primary)", border: "none" }}
            >
              <X size={16} />
            </button>
            <PreviewBody loading={loading} image={image} name={name} large />
          </div>
        </div>
      )}
    </span>
  );
}

function PreviewBody({
  loading,
  image,
  name,
  large,
}: {
  loading: boolean;
  image: string | null | undefined;
  name: string;
  large?: boolean;
}) {
  if (loading) {
    return (
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading…</span>
    );
  }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        style={{
          width: large ? 240 : 160,
          height: "auto",
          borderRadius: 10,
          display: "block",
        }}
      />
    );
  }
  if (image === null) {
    return (
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No image</span>
    );
  }
  return null;
}
