"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Activity, BarChart3, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Menu, MessageCircle, Settings, ShoppingBag, Wallet, X } from "lucide-react";

const navSections = [
  { label: "OVERVIEW", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ]},
  { label: "MANAGEMENT", items: [
    { href: "/finance", label: "Finance", icon: Wallet },
    { href: "/cardmarket", label: "Cardmarket", icon: ShoppingBag },
  ]},
  { label: "TEAM", items: [
    { href: "/meetings", label: "Meetings", icon: MessageCircle },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
  ]},
  { label: "SYSTEM", items: [
    { href: "/activity", label: "Activity", icon: Activity },
  ]},
];
const bottomItems = [{ href: "/settings", label: "Settings", icon: Settings }];

const sidebarSurface = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
  borderRight: "1.5px solid rgba(255,255,255,0.10)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  backdropFilter: "blur(8px)",
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile header */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12"
        style={{ background: "var(--header-bg)", backdropFilter: "var(--surface-blur)", borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
          MISSTEP
        </span>
        <button onClick={onToggle} style={{ color: "var(--text-secondary)" }}>
          <Menu size={20} />
        </button>
      </header>

      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-200 ease-in-out
          ${collapsed ? "-translate-x-full md:translate-x-0 md:w-16" : "translate-x-0 w-[260px]"}
        `}
        style={sidebarSurface}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          {!collapsed && (
            <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontWeight: 600, fontSize: "18px", color: "var(--accent)" }}>MISSTEP</span>
            </Link>
          )}
          {collapsed && (
            <span style={{ fontWeight: 700, fontSize: "18px", color: "var(--accent)", width: "100%", textAlign: "center" }}>M</span>
          )}
          <button
            onClick={onToggle}
            className="hidden md:flex items-center justify-center"
            style={{ color: "var(--text-muted)", padding: "4px", borderRadius: "var(--radius)", background: "transparent" }}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button
            onClick={onToggle}
            className="md:hidden flex items-center justify-center"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: "12px 12px 0", scrollbarWidth: "thin" }}>
          {navSections.map((section) => (
            <div key={section.label} className="mb-2">
              {!collapsed && (
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                    padding: "12px 12px 6px",
                    margin: 0,
                  }}
                >
                  {section.label}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {section.items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { if (window.innerWidth < 768) onToggle(); }}
                      className={`flex items-center rounded-[var(--radius)] transition-all duration-150 ${collapsed ? "justify-center" : ""}`}
                      style={{
                        gap: "10px",
                        padding: collapsed ? "8px" : "8px 12px",
                        background: active ? "rgba(255, 255, 255, 0.03)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-secondary)",
                        textDecoration: "none",
                        fontSize: "14px",
                        fontWeight: 500,
                        borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                        if (!active) e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = active ? "rgba(255, 255, 255, 0.03)" : "transparent";
                        if (!active) e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "20px", height: "20px" }}>
                        <item.icon size={18} style={active ? { color: "var(--accent)" } : undefined} />
                      </span>
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {bottomItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-[var(--radius)] transition-all duration-150 ${collapsed ? "justify-center" : ""}`}
                style={{
                  gap: "10px",
                  padding: collapsed ? "8px" : "8px 12px",
                  background: active ? "rgba(255, 255, 255, 0.03)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 500,
                  borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  if (!active) e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active ? "rgba(255, 255, 255, 0.03)" : "transparent";
                  if (!active) e.currentTarget.style.color = "var(--text-secondary)";
                }}
                title={collapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "20px", height: "20px" }}>
                  <item.icon size={18} style={active ? { color: "var(--accent)" } : undefined} />
                </span>
                {!collapsed && item.label}
              </Link>
            );
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={`flex items-center rounded-[var(--radius)] w-full transition-all duration-150 ${collapsed ? "justify-center" : ""}`}
            style={{
              gap: "10px",
              padding: collapsed ? "8px" : "8px 12px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "none",
              borderLeft: "3px solid transparent",
              fontSize: "14px",
              fontWeight: 500,
              textAlign: "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title={collapsed ? "Sign out" : undefined}
          >
            <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "20px", height: "20px" }}>
              <LogOut size={18} />
            </span>
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
