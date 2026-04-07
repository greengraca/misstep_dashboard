"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  disableBackdropClose?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  disableBackdropClose = false,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-bg)" }}
      onClick={(e) => {
        if (!disableBackdropClose && e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`modal-body w-full ${maxWidth} p-6`}
        style={{
          background: "linear-gradient(135deg, #0f1419, #1a2030)",
          border: "1.5px solid rgba(255, 255, 255, 0.10)",
          borderRadius: "24px",
          boxShadow: "0 40px 120px rgba(0, 0, 0, 0.6)",
          animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
