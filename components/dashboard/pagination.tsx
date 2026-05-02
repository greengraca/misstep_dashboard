"use client";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** When provided, renders a page-size selector on the left.
   *  The handler should reset to page 1 internally. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100];

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1 && !onPageSizeChange) return null;
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
      className="flex items-center justify-between mt-3 pt-3 flex-wrap gap-2"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Page {page} of {lastPage}</span>
        {onPageSizeChange && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="inline-flex items-center gap-1">
              Show
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="appraiser-field px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              per page
            </span>
          </>
        )}
      </div>
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
