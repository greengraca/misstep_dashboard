"use client";

import Modal from "./modal";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        {message}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: variant === "danger" ? "var(--error-light)" : "rgba(251, 191, 36, 0.15)",
            color: variant === "danger" ? "var(--error)" : "var(--accent)",
            border: variant === "danger" ? "1px solid var(--error)" : "1px solid rgba(251, 191, 36, 0.35)",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
