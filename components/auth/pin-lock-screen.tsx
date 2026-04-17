"use client";
import { useState, useRef, useCallback } from "react";
import { signIn } from "next-auth/react";

export function PinLockScreen({ callbackUrl }: { callbackUrl: string }) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", ""]);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submitPin = useCallback(async (pin: string) => {
    if (loading) return;
    setLoading(true);
    setError(false);

    const result = await signIn("pin", { pin, redirect: false });

    if (result?.error) {
      setShaking(true);
      setError(true);
      setDigits(["", "", "", "", ""]);
      setTimeout(() => {
        setShaking(false);
        inputRefs.current[0]?.focus();
      }, 400);
    } else {
      window.location.href = callbackUrl || "/";
    }
    setLoading(false);
  }, [loading, callbackUrl]);

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(false);

    if (digit && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 4) {
      const pin = next.join("");
      if (pin.length === 5) submitPin(pin);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 5; i++) {
      next[i] = pasted[i] || "";
    }
    setDigits(next);
    setError(false);
    const lastFilled = Math.min(pasted.length, 4);
    inputRefs.current[lastFilled]?.focus();
    if (pasted.length === 5) submitPin(pasted);
  }

  return (
    <>
      <style>{`
        @keyframes pin-shake {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-8px); }
          30%  { transform: translateX(8px); }
          45%  { transform: translateX(-6px); }
          60%  { transform: translateX(6px); }
          75%  { transform: translateX(-3px); }
          90%  { transform: translateX(3px); }
          100% { transform: translateX(0); }
        }
        @keyframes pin-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pin-digit:focus {
          outline: none;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent) !important;
        }
        .pin-digit::selection {
          background: transparent;
        }
      `}</style>

      <main style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg-page)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          filter: "blur(140px)",
          opacity: 0.12,
          background: "var(--accent)",
          top: "15%",
          left: "35%",
          pointerEvents: "none",
        }} />

        {/* Card */}
        <div style={{
          background: "var(--surface-gradient)",
          backdropFilter: "var(--surface-blur)",
          border: "var(--surface-border)",
          boxShadow: "var(--surface-shadow)",
          borderRadius: "var(--radius)",
          padding: "48px 40px",
          maxWidth: "380px",
          width: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "28px",
          animation: shaking ? "pin-shake 0.4s ease" : "none",
        }}>
          {/* Lock icon */}
          <div style={{
            width: "52px",
            height: "52px",
            borderRadius: "14px",
            background: "var(--accent-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <img
              src="/misstep-horizontal.svg"
              alt="MISSTEP"
              style={{
                display: "block",
                height: "44px",
                width: "auto",
                maxWidth: "100%",
                margin: "0 auto 12px",
              }}
            />
            <p style={{
              color: "var(--text-muted)",
              fontSize: "14px",
              margin: 0,
            }}>
              Enter PIN to continue
            </p>
          </div>

          {/* PIN inputs */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
            onPaste={handlePaste}
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                className="pin-digit"
                type="password"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                value={digit}
                disabled={loading}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                autoFocus={i === 0}
                autoComplete="off"
                style={{
                  width: "52px",
                  height: "60px",
                  textAlign: "center",
                  fontSize: "24px",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--text-primary)",
                  background: digit
                    ? "color-mix(in srgb, var(--accent) 10%, var(--bg-card))"
                    : "var(--bg-card)",
                  border: error
                    ? "1.5px solid var(--error, #ef4444)"
                    : digit
                    ? "1.5px solid var(--accent-border-strong)"
                    : "1.5px solid var(--border)",
                  borderRadius: "10px",
                  transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                  cursor: loading ? "not-allowed" : "text",
                  opacity: loading ? 0.6 : 1,
                  caretColor: "transparent",
                }}
              />
            ))}
          </div>

          {/* Error message */}
          <div style={{
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {error && (
              <p style={{
                color: "var(--error, #ef4444)",
                fontSize: "13px",
                margin: 0,
                fontWeight: 500,
                animation: "pin-fade-in 0.2s ease",
              }}>
                Wrong PIN — please try again
              </p>
            )}
          </div>

          {/* Loading indicator */}
          {loading && (
            <p style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              margin: 0,
              animation: "pin-fade-in 0.2s ease",
            }}>
              Verifying...
            </p>
          )}
        </div>
      </main>
    </>
  );
}
