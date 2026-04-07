"use client";

import { useState } from "react";
import { SWRConfig } from "swr";
import Sidebar from "@/components/dashboard/sidebar";
import { SensitiveDataProvider } from "@/contexts/SensitiveDataContext";
import { fetcher } from "@/lib/fetcher";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 60_000,
        revalidateOnFocus: false,
        revalidateIfStale: true,
        keepPreviousData: true,
        revalidateOnReconnect: true,
      }}
    >
      <SensitiveDataProvider>
        <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <main
            className={`transition-all duration-200 ease-in-out min-h-screen ${
              collapsed ? "md:ml-16" : "md:ml-[260px]"
            }`}
          >
            <div className="p-4 pt-14 md:pt-8 md:p-8 max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </SensitiveDataProvider>
    </SWRConfig>
  );
}
