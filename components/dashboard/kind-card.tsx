"use client";

export type KindCardTone = "accent" | "success" | "danger" | "neutral";

interface KindCardProps {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  /** Color theme for the active state. Default 'accent' (cyan).
   *  Use 'success' for income / positive flows, 'danger' for expense / negative,
   *  'neutral' for transfers / non-P&L moves. */
  tone?: KindCardTone;
}

interface ToneStyle {
  /** Active border + ring color */
  border: string;
  /** Active title text color */
  text: string;
  /** Active card background tint */
  bg: string;
  /** Active icon-bubble background (slightly stronger than card bg) */
  iconBg: string;
  /** Inactive icon-bubble background */
  iconBgIdle: string;
}

const TONES: Record<KindCardTone, ToneStyle> = {
  accent: {
    border: "var(--accent)",
    text: "var(--accent)",
    bg: "var(--accent-light)",
    iconBg: "rgba(63,206,229,0.20)",
    iconBgIdle: "var(--accent-light)",
  },
  success: {
    border: "var(--success)",
    text: "var(--success)",
    bg: "var(--success-light)",
    iconBg: "rgba(52,211,153,0.22)",
    iconBgIdle: "var(--success-light)",
  },
  danger: {
    border: "var(--error)",
    text: "var(--error)",
    bg: "var(--error-light)",
    iconBg: "rgba(252,165,165,0.18)",
    iconBgIdle: "var(--error-light)",
  },
  neutral: {
    border: "var(--text-tertiary)",
    text: "var(--text-primary)",
    bg: "rgba(255,255,255,0.06)",
    iconBg: "rgba(255,255,255,0.12)",
    iconBgIdle: "rgba(255,255,255,0.05)",
  },
};

/** Selectable card used by modal flows that begin with a kind picker
 *  (e.g. "what kind of investment / transaction is this?").
 *  - inactive: bg-card, subtle border
 *  - hover (inactive): brighten bg + border
 *  - active: tone-tinted background + tone border + 1px ring */
export function KindCard({ active, icon, title, description, onClick, tone = "accent" }: KindCardProps) {
  const t = TONES[tone];
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all"
      style={{
        background: active ? t.bg : "var(--bg-card)",
        border: active ? `1px solid ${t.border}` : "1px solid var(--border)",
        boxShadow: active ? `0 0 0 1px ${t.border}` : "none",
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
        style={{ background: active ? t.iconBg : t.iconBgIdle }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: active ? t.text : "var(--text-primary)" }}
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
