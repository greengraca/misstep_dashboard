"use client";

import { type ReactNode } from "react";
import { EyeOff } from "lucide-react";
import { useSensitiveData } from "@/contexts/SensitiveDataContext";

interface SensitiveProps {
  children: ReactNode;
  placeholder?: string;
}

export function Sensitive({ children, placeholder = "••••" }: SensitiveProps) {
  const { hidden } = useSensitiveData();
  if (!hidden) return <>{children}</>;
  return (
    <span
      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      aria-label="Hidden"
    >
      {placeholder}
    </span>
  );
}

interface SensitiveBlockProps {
  message?: string;
  height?: number | string;
}

export function SensitiveBlock({
  message = "Hidden in privacy mode",
  height = 280,
}: SensitiveBlockProps) {
  const { hidden } = useSensitiveData();
  if (!hidden) return null;
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg"
      style={{
        height,
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px dashed var(--border)",
        color: "var(--text-muted)",
      }}
    >
      <EyeOff className="w-6 h-6" style={{ opacity: 0.5 }} />
      <span className="text-sm">{message}</span>
    </div>
  );
}
