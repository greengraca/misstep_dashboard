"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface LinkCardProps {
  /** Internal route (uses next/link) */
  href: string;
  /** Set true if this should trigger a real download / external request
   *  rather than client-side navigation. Renders as a plain <a download>. */
  download?: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
}

/** Click-through tile used on Settings and similar pages. Glass surface +
 *  accent-tinted icon bubble + title + muted description + chevron-right.
 *  Hover lifts the card and brightens the chevron. */
export function LinkCard({ href, download, icon, title, description }: LinkCardProps) {
  const body = (
    <div
      className="group flex items-center gap-4 p-4 sm:p-5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--accent-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>
          {title}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {description}
        </div>
      </div>
      <ChevronRight
        size={18}
        className="transition-colors"
        style={{ color: "var(--text-muted)" }}
      />
    </div>
  );

  if (download) {
    return (
      <a href={href} download style={{ textDecoration: "none", color: "inherit" }}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {body}
    </Link>
  );
}
