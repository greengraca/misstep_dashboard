"use client";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < lastPage;

  function buttonStyle(enabled: boolean): React.CSSProperties {
    return {
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      color: enabled ? "var(--text-primary)" : "var(--text-muted)",
      opacity: enabled ? 1 : 0.4,
      cursor: enabled ? "pointer" : "not-allowed",
    };
  }

  return (
    <div
      className="flex items-center justify-between mt-3 pt-3"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Page {page} of {lastPage}
      </span>
      <div className="flex gap-2">
        <button
          disabled={!canPrev}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded text-xs"
          style={buttonStyle(canPrev)}
        >
          Prev
        </button>
        <button
          disabled={!canNext}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded text-xs"
          style={buttonStyle(canNext)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
