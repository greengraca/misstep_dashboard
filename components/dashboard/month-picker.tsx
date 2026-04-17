"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthPickerProps {
  value: string; // "YYYY-MM"
  onChange: (month: string) => void;
  minMonth?: string;
  maxMonth?: string;
  highlight?: boolean;
}

function parseMonth(m: string): [number, number] {
  const [y, mo] = m.split("-").map(Number);
  return [y, mo];
}

function formatMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function displayMonth(m: string): string {
  const [y, mo] = parseMonth(m);
  const date = new Date(y, mo - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function MonthPicker({
  value,
  onChange,
  minMonth,
  maxMonth,
  highlight,
}: MonthPickerProps) {
  const [y, m] = parseMonth(value);
  const outlined = highlight;
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (highlight) {
      setBlinking(true);
      const blinkTimer = setTimeout(() => setBlinking(false), 1200);
      return () => { clearTimeout(blinkTimer); };
    }
    setBlinking(false);
  }, [highlight, value]);

  function prev() {
    const nm = m === 1 ? 12 : m - 1;
    const ny = m === 1 ? y - 1 : y;
    const next = formatMonth(ny, nm);
    if (minMonth && next < minMonth) return;
    onChange(next);
  }

  function next() {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    const nextMonth = formatMonth(ny, nm);
    if (maxMonth && nextMonth > maxMonth) return;
    onChange(nextMonth);
  }

  const canPrev = !minMonth || value > minMonth;
  const canNext = !maxMonth || value < maxMonth;

  return (
    <div
      className={`flex items-center gap-2 transition-all ${blinking ? "animate-month-blink" : ""}`}
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: outlined ? "1px solid var(--accent)" : "var(--surface-border)",
        boxShadow: outlined ? "0 0 8px rgba(251,191,36,0.3)" : "none",
        borderRadius: "20px",
        padding: "4px",
      }}
    >
      <button
        onClick={prev}
        disabled={!canPrev}
        className="p-1.5 transition-colors disabled:opacity-30"
        style={{
          color: "var(--text-secondary)",
          background: "transparent",
          borderRadius: "16px",
        }}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span
        className="text-sm font-medium min-w-[110px] sm:min-w-[140px] text-center px-2 sm:px-3 py-1 whitespace-nowrap"
        style={{
          color: "var(--text-primary)",
          borderRadius: "16px",
        }}
      >
        {displayMonth(value)}
      </span>
      <button
        onClick={next}
        disabled={!canNext}
        className="p-1.5 transition-colors disabled:opacity-30"
        style={{
          color: "var(--text-secondary)",
          background: "transparent",
          borderRadius: "16px",
        }}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
