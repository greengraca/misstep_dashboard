"use client";
import { Suspense } from "react";
import { Shield } from "lucide-react";
import { PinLockScreen } from "@/components/auth/pin-lock-screen";

function LoginForm() {
  const callbackUrl = "/";

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", width: "300px", height: "300px",
        borderRadius: "50%", filter: "blur(120px)", opacity: 0.15,
        background: "var(--accent)", top: "20%", left: "30%",
      }} />

      <div style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
        padding: "40px",
        maxWidth: "400px",
        width: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}>
        <div style={{
          width: "48px", height: "48px", borderRadius: "12px",
          background: "var(--accent-light)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Shield size={24} style={{ color: "var(--accent)" }} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
            MISSTEP
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            Sign in to access the dashboard
          </p>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
          <PinLockScreen callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}