"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface AccordionProps {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

export default function Accordion({
  title,
  icon,
  badge,
  defaultOpen = false,
  onToggle,
  children,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.015)",
        border: "1px solid var(--border)",
      }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: "rgba(255, 255, 255, 0.02)" }}
        onClick={toggle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
        }}
      >
        <ChevronRight
          className="w-4 h-4 transition-transform duration-200"
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
        {icon && (
          <span style={{ color: "var(--accent)" }}>{icon}</span>
        )}
        <span
          className="text-sm font-medium flex-1"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </span>
        {badge}
      </button>
      {open && (
        <div
          className="border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
