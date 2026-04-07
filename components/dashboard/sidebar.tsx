"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Activity, BarChart3, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Menu, MessageCircle, Settings, Wallet, X } from "lucide-react";

const navSections = [
  { label: "OVERVIEW", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ]},
  { label: "MANAGEMENT", items: [
    { href: "/finance", label: "Finance", icon: Wallet },
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
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-200 ease-in-out
          ${collapsed ? "-translate-x-full md:translate-x-0 md:w-16" : "translate-x-0 w-[260px]"}
        `}
        style={{
          background: "var(--bg-page)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          {!collapsed && (
            <Link href="/" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)", textDecoration: "none" }}>
              MISSTEP
            </Link>
          )}
          <button
            onClick={onToggle}
            className="hidden md:flex items-center justify-center"
            style={{ color: "var(--text-secondary)", width: "28px", height: "28px", borderRadius: "var(--radius)", background: "transparent" }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
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
        <nav className="flex-1 overflow-y-auto py-3 px-2" style={{ scrollbarWidth: "thin" }}>
          {navSections.map((section) => (
            <div key={section.label} className="mb-4">
              {!collapsed && (
                <p
                  className="px-3 mb-1"
                  style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}
                >
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { if (window.innerWidth < 768) onToggle(); }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${collapsed ? "justify-center" : ""}`}
                    style={{
                      background: active ? "var(--bg-active)" : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                      textDecoration: "none",
                      fontSize: "14px",
                      fontWeight: active ? 500 : 400,
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="py-3 px-2" style={{ borderTop: "1px solid var(--border)" }}>
          {bottomItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${collapsed ? "justify-center" : ""}`}
                style={{
                  background: active ? "var(--bg-active)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: active ? 500 : 400,
                }}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} />
                {!collapsed && item.label}
              </Link>
            );
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 w-full transition-colors ${collapsed ? "justify-center" : ""}`}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "none",
              fontSize: "14px",
              textAlign: "left",
            }}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={18} />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
