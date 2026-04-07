"use client";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  active?: boolean;
  trend?: {
    value: number;
    label: string;
  };
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  active,
  trend,
}: StatCardProps) {
  return (
    <div
      className="h-full p-3 sm:p-5 rounded-xl transition-all duration-200 group hover:-translate-y-0.5"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: active
          ? "1px solid var(--accent)"
          : "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: active
          ? "0 0 0 1px var(--accent), var(--surface-shadow)"
          : "var(--surface-shadow)",
      }}
    >
      <div className="flex items-start justify-between mb-1.5 sm:mb-3">
        <p
          className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {title}
        </p>
        {icon && (
          <div
            className="hidden sm:block p-2 rounded-lg"
            style={{ background: "var(--accent-light)" }}
          >
            {icon}
          </div>
        )}
      </div>
      <p
        className="text-lg sm:text-2xl font-bold"
        style={{
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </p>
      {(subtitle || trend) && (
        <div className="mt-0.5 sm:mt-1 flex items-center gap-2">
          {trend && (
            <span
              className="text-[10px] sm:text-xs font-medium"
              style={{
                color:
                  trend.value >= 0 ? "var(--success)" : "var(--error)",
              }}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
          )}
          {subtitle && (
            <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
