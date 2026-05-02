"use client";

interface KindCardProps {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

/** Selectable card used by modal flows that begin with a kind picker
 *  (e.g. "what kind of investment / transaction is this?").
 *  - inactive: bg-card, subtle border
 *  - hover (inactive): brighten bg + border
 *  - active: accent-tint background + accent border + 1px ring */
export function KindCard({ active, icon, title, description, onClick }: KindCardProps) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all"
      style={{
        background: active ? "var(--accent-light)" : "var(--bg-card)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: active ? "0 0 0 1px var(--accent)" : "none",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border-hover)";
        e.currentTarget.style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-card)";
      }}
    >
      <div
        className="p-2 rounded-lg"
        style={{ background: active ? "rgba(63,206,229,0.20)" : "var(--accent-light)" }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}
        >
          {title}
        </div>
        <div
          className="text-[11px] mt-1 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}
