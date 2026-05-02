"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Zap,
  Wifi,
  Flame,
  Cpu,
  Lightbulb,
  Maximize2,
  X,
  ChevronRight,
  Wrench,
  Boxes,
  BookOpen,
  BatteryCharging,
  Sparkles,
  Rocket,
  Info,
  ShieldAlert,
  Plug,
  Radio,
  Thermometer,
  Code as CodeIcon,
  ExternalLink,
} from "lucide-react";
import { Panel, H1, H2, H3, Note } from "@/components/dashboard/page-shell";
import ConfirmModal from "@/components/dashboard/confirm-modal";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 4,
        padding: "1px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--accent)",
      }}
    >
      {children}
    </code>
  );
}

function Pre({ children, lang }: { children: React.ReactNode; lang?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!ref.current) return;
    navigator.clipboard.writeText(ref.current.innerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div style={{ position: "relative" }}>
      {lang && (
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {lang}
        </span>
      )}
      <button
        onClick={copy}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          fontSize: 11,
          color: copied ? "var(--success)" : "var(--text-muted)",
          background: "rgba(0,0,0,0.4)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "3px 8px",
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          transition: "color 120ms",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
      <pre
        ref={ref}
        style={{
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: lang ? "30px 14px 14px" : "32px 14px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-primary)",
          overflowX: "auto",
          margin: "8px 0",
          lineHeight: 1.6,
        }}
      >
        {children}
      </pre>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Persistent checkbox                                                       */
/* -------------------------------------------------------------------------- */

// Module-level registry of every <CheckItem> instance currently mounted.
// Lets the page-level progress widget compute "X of Y" without hardcoding
// the total or threading props through every section. Each CheckItem
// registers its id on mount and notifies subscribers whenever the
// completion state changes.
const checkItemRegistry = new Set<string>();
const progressSubscribers = new Set<() => void>();
function notifyProgressChange() {
  for (const cb of progressSubscribers) cb();
}
function checkItemKey(id: string) {
  return `misstep:storage-setup:${id}`;
}

function useCheckProgress(): { done: number; total: number } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    progressSubscribers.add(cb);
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith("misstep:storage-setup:")) cb();
    }
    window.addEventListener("storage", onStorage);
    return () => {
      progressSubscribers.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  let done = 0;
  if (typeof window !== "undefined") {
    for (const id of checkItemRegistry) {
      if (window.localStorage.getItem(checkItemKey(id)) === "1") done++;
    }
  }
  return { done, total: checkItemRegistry.size };
}

function CheckItem({ id, children }: { id: string; children: React.ReactNode }) {
  const storageKey = checkItemKey(id);
  const [done, setDone] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDone(window.localStorage.getItem(storageKey) === "1");
    checkItemRegistry.add(id);
    notifyProgressChange();
    return () => {
      checkItemRegistry.delete(id);
      notifyProgressChange();
    };
  }, [storageKey, id]);
  function toggle() {
    const next = !done;
    setDone(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
    notifyProgressChange();
  }
  return (
    <li
      onClick={toggle}
      style={{
        listStyle: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "7px 0",
        cursor: "pointer",
        color: done ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: done ? "line-through" : "none",
        fontSize: 13,
        lineHeight: 1.6,
        transition: "color 120ms",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        {done ? (
          <CheckCircle2 size={15} style={{ color: "var(--success)" }} />
        ) : (
          <Circle size={15} style={{ color: "var(--text-muted)" }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Image lightbox                                                            */
/* -------------------------------------------------------------------------- */

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        animation: "fadeIn 180ms ease",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "var(--text-primary)",
          width: 36,
          height: 36,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 20px 80px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Part image (in gallery card)                                              */
/* -------------------------------------------------------------------------- */

function PartImage({
  src,
  alt,
  height = 200,
}: {
  src: string;
  alt: string;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: "relative",
          width: "100%",
          height,
          background: "rgba(0,0,0,0.25)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          padding: 0,
          cursor: "zoom-in",
          transition: "border-color 160ms",
          borderColor: hover ? "var(--accent-border)" : "var(--border)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            transition: "transform 240ms ease, filter 240ms ease",
            transform: hover ? "scale(1.04)" : "scale(1)",
            filter: hover ? "brightness(1.08)" : "brightness(1)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: 5,
            color: "var(--text-primary)",
            opacity: hover ? 1 : 0,
            transition: "opacity 160ms",
            display: "flex",
          }}
        >
          <Maximize2 size={12} />
        </span>
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline "part chip" — shown next to a part name in instructions            */
/* -------------------------------------------------------------------------- */

function PartChip({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <>
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "1px 8px 1px 3px",
          borderRadius: 999,
          background: hover ? "var(--accent-light)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${hover ? "var(--accent-border)" : "var(--border)"}`,
          fontWeight: 500,
          color: hover ? "var(--accent)" : "var(--text-primary)",
          cursor: "zoom-in",
          transition: "background 140ms, border-color 140ms, color 140ms",
          fontSize: "0.95em",
          verticalAlign: "baseline",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            objectFit: "cover",
            border: "1px solid rgba(0,0,0,0.4)",
            flexShrink: 0,
          }}
        />
        {label}
        {/* hover preview */}
        {hover && (
          <span
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              padding: 4,
              background: "var(--bg-page)",
              border: "1.5px solid var(--accent-border)",
              borderRadius: 8,
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              zIndex: 50,
              pointerEvents: "none",
              animation: "fadeIn 140ms ease",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={label}
              style={{
                width: 220,
                height: 160,
                objectFit: "cover",
                borderRadius: 6,
                display: "block",
              }}
            />
          </span>
        )}
      </span>
      {open && <Lightbox src={src} alt={label} onClose={() => setOpen(false)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step header                                                               */
/* -------------------------------------------------------------------------- */

function StepHeader({
  num,
  title,
  goal,
  icon,
}: {
  num: number;
  title: string;
  goal: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--accent-light)",
            border: "1.5px solid var(--accent-border)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {String(num).padStart(2, "0")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.01em",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {icon && <span style={{ color: "var(--accent)" }}>{icon}</span>}
            {title}
          </h2>
        </div>
      </div>
      <div
        style={{
          marginLeft: 58,
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          paddingLeft: 12,
          borderLeft: "2px solid var(--accent-border)",
        }}
      >
        <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em" }}>Goal</span>
        <br />
        {goal}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Parts gallery card                                                        */
/* -------------------------------------------------------------------------- */

function PartCard({
  src,
  name,
  role,
  filename,
  caution,
}: {
  src: string;
  name: string;
  role: string;
  filename: string;
  caution?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PartImage src={src} alt={name} height={180} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{role}</div>
        {caution && (
          <div
            style={{
              fontSize: 11,
              color: "var(--warning)",
              marginTop: 4,
              display: "flex",
              alignItems: "flex-start",
              gap: 5,
              lineHeight: 1.45,
            }}
          >
            <AlertTriangle size={11} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{caution}</span>
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginTop: 4,
          }}
        >
          {filename}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wiring diagram                                                            */
/* -------------------------------------------------------------------------- */

function WiringDiagram() {
  return (
    <svg
      viewBox="0 0 700 460"
      style={{
        width: "100%",
        maxWidth: 700,
        height: "auto",
        background: "rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 12,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <style>{`
        .box { fill: rgba(255,255,255,0.04); stroke: rgba(255,255,255,0.2); stroke-width: 1.5; rx: 6; }
        .label { fill: #f1f5f9; font-family: var(--font-mono), monospace; font-size: 12px; font-weight: 600; }
        .pin { fill: #94a3b8; font-family: var(--font-mono), monospace; font-size: 10px; }
        .small { fill: #64748b; font-family: var(--font-mono), monospace; font-size: 9px; }
        .wire-r { stroke: #ef4444; stroke-width: 2.2; fill: none; }
        .wire-k { stroke: #94a3b8; stroke-width: 2.2; fill: none; }
        .wire-g { stroke: #34d399; stroke-width: 2.2; fill: none; }
        .wire-y { stroke: #fbbf24; stroke-width: 2.2; fill: none; }
        .cap { fill: rgba(251,191,36,0.25); stroke: #fbbf24; stroke-width: 1.2; }
        .res { fill: rgba(63,206,229,0.18); stroke: #3fcee5; stroke-width: 1.2; }
      `}</style>

      {/* PSU/charger */}
      <rect x="20" y="40" width="170" height="86" className="box" />
      <text x="105" y="68" textAnchor="middle" className="label">5V source</text>
      <text x="105" y="86" textAnchor="middle" className="pin">USB-A charger</text>
      <text x="105" y="100" textAnchor="middle" className="pin">(or Mean Well S-50-5)</text>
      <text x="105" y="116" textAnchor="middle" className="small">230V AC → 5V DC</text>

      {/* Bus rail labels */}
      <text x="200" y="52" className="pin">+5V</text>
      <text x="200" y="118" className="pin">GND</text>
      <path d="M 190 60 L 220 60" className="wire-r" />
      <path d="M 190 105 L 220 105" className="wire-k" />

      {/* Cap */}
      <circle cx="240" cy="82" r="12" className="cap" />
      <text x="240" y="86" textAnchor="middle" className="small">1000µF</text>
      <path d="M 240 70 L 240 60" className="wire-r" />
      <path d="M 240 94 L 240 105" className="wire-k" />

      {/* Rails */}
      <path d="M 220 60 L 660 60" className="wire-r" />
      <path d="M 220 105 L 660 105" className="wire-k" />
      <text x="666" y="63" className="pin">+5V rail</text>
      <text x="666" y="108" className="pin">GND rail</text>

      {/* ESP32 */}
      <rect x="240" y="160" width="180" height="100" className="box" />
      <text x="330" y="190" textAnchor="middle" className="label">ESP32-S3</text>
      <text x="330" y="208" textAnchor="middle" className="pin">5V · GND · GPIO5 · GPIO4</text>
      <text x="330" y="224" textAnchor="middle" className="pin">USB-C ▶ flashing</text>
      <text x="330" y="244" textAnchor="middle" className="small">WiFi 2.4 GHz · MQTT</text>

      <path d="M 270 160 L 270 60" className="wire-r" />
      <path d="M 310 160 L 310 105" className="wire-k" />

      {/* Level shifter */}
      <rect x="260" y="290" width="140" height="64" className="box" />
      <text x="330" y="316" textAnchor="middle" className="label">74AHCT125</text>
      <text x="330" y="334" textAnchor="middle" className="pin">3.3V → 5V buffer</text>

      <path d="M 350 260 L 350 290" className="wire-y" markerEnd="url(#arr)" />
      <text x="358" y="278" className="small">GPIO5 → pin 2</text>

      <path d="M 280 290 L 280 105" className="wire-k" />
      <path d="M 380 290 L 380 60" className="wire-r" />

      {/* Resistor */}
      <rect x="430" y="310" width="44" height="22" className="res" />
      <text x="452" y="324" textAnchor="middle" className="pin">330Ω</text>
      <path d="M 400 322 L 430 322" className="wire-y" />

      {/* Strip */}
      <rect x="510" y="290" width="150" height="64" className="box" />
      <text x="585" y="316" textAnchor="middle" className="label">WS2812B strip</text>
      <text x="585" y="334" textAnchor="middle" className="pin">5V · DIN · GND</text>

      <path d="M 474 322 L 510 322" className="wire-y" markerEnd="url(#arr)" />
      <path d="M 600 290 L 600 60" className="wire-r" />
      <path d="M 560 290 L 560 105" className="wire-k" />

      {/* Legend */}
      <rect x="20" y="410" width="20" height="3" fill="#ef4444" />
      <text x="46" y="414" className="small">+5V</text>
      <rect x="90" y="410" width="20" height="3" fill="#94a3b8" />
      <text x="116" y="414" className="small">GND</text>
      <rect x="160" y="410" width="20" height="3" fill="#fbbf24" />
      <text x="186" y="414" className="small">DATA (3.3V → 5V)</text>
      <text x="20" y="438" className="small">arrow on strip points AWAY from input — connect at the AWAY side.</text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mental model diagram                                                      */
/* -------------------------------------------------------------------------- */

function MentalModel() {
  const Block = ({ label, sub, color }: { label: string; sub?: string; color: string }) => (
    <div
      style={{
        flex: 1,
        minWidth: 110,
        padding: "10px 12px",
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12, color, fontFamily: "var(--font-mono)" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
  const Arrow = () => (
    <div
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 16,
        flexShrink: 0,
        padding: "0 4px",
      }}
    >
      →
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Block label="WALL" sub="230V AC" color="#fca5a5" />
        <Arrow />
        <Block label="PSU" sub="5V DC" color="#fbbf24" />
        <Arrow />
        <Block label="ESP32" sub="WiFi brain" color="#3fcee5" />
        <Arrow />
        <Block label="SHIFTER" sub="3.3V → 5V" color="#a78bfa" />
        <Arrow />
        <Block label="LEDs" sub="WS2812B" color="#34d399" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Block label="LAPTOP" sub="dashboard" color="#94a3b8" />
        <Arrow />
        <Block label="MQTT" sub="HiveMQ cloud" color="#3fcee5" />
        <Arrow />
        <Block label="ESP32" sub="receives commands" color="#3fcee5" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <div
      style={{
        position: "relative",
        background:
          "radial-gradient(ellipse at top right, rgba(63,206,229,0.10), transparent 60%), radial-gradient(ellipse at bottom left, rgba(168,139,250,0.08), transparent 60%), linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
        padding: "32px 28px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          borderRadius: 999,
          background: "var(--accent-light)",
          border: "1px solid var(--accent-border)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--accent)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        <Sparkles size={12} />
        Build #1 — bench prototype
      </div>
      <H1>Storage LED — one-box test</H1>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: 15,
          margin: "12px 0 0",
          maxWidth: 720,
          lineHeight: 1.6,
        }}
      >
        First-time-electronics walkthrough for wiring one card box with a
        controllable LED strip. End goal of this build: click a slot in the
        Stock table → the matching LED on the box lights up. We get this
        working bench-side before scaling to 25 boxes.
      </p>
      <div
        style={{
          marginTop: 20,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          <Thermometer size={12} /> 4–6 h spread over 2 evenings
        </span>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          <Boxes size={12} /> €150 already spent
        </span>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          <CodeIcon size={12} /> ESPHome firmware · MQTT · HiveMQ free tier
        </span>
      </div>
      <div style={{ marginTop: 24 }}>
        <MentalModel />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Glossary                                                                  */
/* -------------------------------------------------------------------------- */

const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "5V / 3.3V", meaning: "DC voltages. Most chips run at 3.3V; LED strips want 5V." },
  { term: "GND", meaning: "Ground — the return path for current. Every +5V wire needs a matching GND." },
  { term: "GPIO", meaning: "Pins on the ESP32 you can program. We use GPIO5 (data) and GPIO4 (button)." },
  { term: "DIN", meaning: "Data IN — the input pin on the LED strip that listens for instructions." },
  { term: "PSU", meaning: "Power Supply Unit. Converts 230V wall AC into 5V DC." },
  { term: "Breadboard", meaning: "Reusable plastic board with rows of holes that connect under the surface — push wires in to make a circuit without soldering." },
  { term: "Dupont wires", meaning: "Pre-made multi-coloured jumper wires with metal pins on the ends." },
  { term: "Decoupling cap", meaning: "A reservoir of charge across +5V/GND that smooths out voltage dips when the strip suddenly draws current." },
  { term: "Level shifter", meaning: "Chip that translates 3.3V signals → 5V signals. The 74AHCT125." },
  { term: "Heatshrink", meaning: "Plastic tubing that shrinks when heated — slide it over a soldered joint and shrink with the heat gun for insulation." },
  { term: "Solder", meaning: "Metal alloy that melts at ~250°C. Bonds two metals permanently." },
  { term: "Flux", meaning: "Chemical that cleans metal as you solder so the joint actually bonds. Your solder wire has flux inside it — usually no extra needed." },
  { term: "MQTT", meaning: "Messaging protocol. Like a chatroom for devices: ESP32 says 'I'm here', dashboard says 'light LED #42 green', the broker passes it on." },
  { term: "HiveMQ", meaning: "The free cloud-hosted MQTT broker we'll use." },
  { term: "ESPHome", meaning: "Firmware framework. Instead of writing C++, you write a YAML file describing what the ESP32 should do." },
  { term: "Firmware", meaning: "The small program that lives on the ESP32 and tells it what to do. We 'flash' it via USB-C." },
];

function Glossary() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 10,
      }}
    >
      {GLOSSARY.map(({ term, meaning }) => (
        <div
          key={term}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: "var(--accent)",
              letterSpacing: "0.02em",
            }}
          >
            {term}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
            {meaning}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Parts data                                                                */
/* -------------------------------------------------------------------------- */

const P = {
  led: "/storage-setup/ws2812b-strip.jpeg",
  esp32: "/storage-setup/esp32-s3.jpeg",
  psuFront: "/storage-setup/psu-5v-10a-terminals.jpeg",
  psuSide: "/storage-setup/psu-5v-10a-side.jpeg",
  pigtail: "/storage-setup/dc-barrel-pigtail.jpeg",
  shifter: "/storage-setup/level-shifter-74ahct125.jpeg",
  caps: "/storage-setup/capacitor-kit.jpeg",
  res: "/storage-setup/resistor-kit.jpeg",
  silicone: "/storage-setup/silicone-wire-red-black.jpeg",
  dupont: "/storage-setup/dupont-jumpers.jpeg",
  bread: "/storage-setup/breadboard.jpeg",
  buttons: "/storage-setup/pushbuttons.jpeg",
  iron: "/storage-setup/soldering-iron.jpeg",
  solder: "/storage-setup/solder-wire.jpeg",
  wick: "/storage-setup/solder-wick.jpeg",
  strip: "/storage-setup/wire-stripper-multitool.jpeg",
  cutters: "/storage-setup/flush-cutters.jpeg",
  multi: "/storage-setup/multimeter-aneng-an8008.jpeg",
  shrink: "/storage-setup/heatshrink-kit.jpeg",
  gun: "/storage-setup/heat-gun.jpeg",
  hands: "/storage-setup/helping-hands.jpeg",
};

/* -------------------------------------------------------------------------- */
/*  Toolbar / nav                                                             */
/* -------------------------------------------------------------------------- */

const NAV: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Sparkles size={13} /> },
  { id: "glossary", label: "Glossary", icon: <BookOpen size={13} /> },
  { id: "parts", label: "Parts", icon: <Boxes size={13} /> },
  { id: "tools", label: "Tools", icon: <Wrench size={13} /> },
  { id: "safety", label: "Safety", icon: <ShieldAlert size={13} /> },
  { id: "wiring", label: "Wiring", icon: <Plug size={13} /> },
  { id: "build", label: "Build steps", icon: <BatteryCharging size={13} /> },
  { id: "firmware", label: "Firmware", icon: <Cpu size={13} /> },
  { id: "first-light", label: "First light", icon: <Lightbulb size={13} /> },
  { id: "trouble", label: "Troubleshoot", icon: <AlertTriangle size={13} /> },
  { id: "next", label: "What's next", icon: <Rocket size={13} /> },
];

function StickyNav() {
  const { done, total } = useCheckProgress();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const [confirmReset, setConfirmReset] = useState(false);

  function performReset() {
    if (typeof window === "undefined") return;
    setConfirmReset(false);
    for (const id of checkItemRegistry) {
      window.localStorage.removeItem(checkItemKey(id));
    }
    // Force every mounted CheckItem to re-read its localStorage value.
    notifyProgressChange();
    // Re-emit a storage event for cross-instance reactivity (CheckItem's own
    // useEffect doesn't re-run on storage; trigger the equivalent path).
    window.location.reload();
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        marginBottom: 24,
        padding: "10px 12px",
        background: "rgba(10,15,20,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "background 120ms, color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-light)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            {n.icon}
            {n.label}
          </a>
        ))}
      </div>

      {/* Progress strip — overall completion across every CheckItem on the
          page. Bar turns success-green when 100%. Reset button is muted
          and tucked at the right so it doesn't invite mis-clicks. */}
      {total > 0 && (
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${pct}%`,
                background: allDone ? "var(--success)" : "var(--accent)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 11,
              color: allDone ? "var(--success)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              minWidth: 80,
              textAlign: "right",
            }}
            title={allDone ? "All checks complete!" : `${total - done} remaining`}
          >
            {done} / {total} · {pct}%
          </span>
          <button
            onClick={() => setConfirmReset(true)}
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              transition: "color 120ms, border-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--error)";
              e.currentTarget.style.borderColor = "var(--error-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
            title="Clear every check mark on this page"
          >
            reset
          </button>
        </div>
      )}
      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={performReset}
        title="Reset all checks?"
        message={`Reset all ${total} check marks on this page? This can't be undone — you'll lose every progress mark.`}
        confirmLabel="Reset"
        variant="danger"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function StorageSetupContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <StickyNav />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="overview">
        <Hero />
      </section>

      {/* ── Path A vs Path B note ──────────────────────────────────────── */}
      <Panel accent="var(--accent)">
        <H2 icon={<Plug size={18} />}>How you'll power the bench: Path A</H2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 12px" }}>
          Your kit has the proper{" "}
          <PartChip src={P.psuFront} label="Mean Well S-50-5 PSU" /> — but it requires wiring
          230 V mains into the screw terminals via a Schuko plug. <strong>Don't do that on
          build #1.</strong> Use Path A:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: "var(--success-light)",
              border: "1px solid rgba(52,211,153,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--success)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                }}
              >
                PATH A · BENCH (this build)
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
              Cut the USB-A end off any old phone-charger cable.{" "}
              <strong style={{ color: "#ef4444" }}>Red wire</strong> = +5 V,{" "}
              <strong>black wire</strong> = GND. Plug the charger into the wall — the dangerous
              part is already done by the manufacturer. Strip the two wires and you have a
              5 V source with zero exposed mains.
            </div>
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              opacity: 0.85,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                }}
              >
                PATH B · PSU (later)
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              When you build the second carrier and you're confident, wire L/N into the PSU's
              terminal block via a Schuko plug. Same 5 V output, much higher current capacity,
              feeds the full 25-box deployment.
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Glossary ───────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="glossary" icon={<BookOpen size={18} />}>Plain-English glossary</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Skim once. Refer back when a term shows up below.
        </p>
        <Glossary />
      </Panel>

      {/* ── Parts gallery ──────────────────────────────────────────────── */}
      <Panel>
        <H2 id="parts" icon={<Boxes size={18} />}>Parts you have</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Click any photo to see it full-size. Hover any{" "}
          <PartChip src={P.led} label="part name" /> in the steps below to peek a thumbnail.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <PartCard
            src={P.led}
            name="WS2812B LED strip"
            role="144 LEDs/m, 5 m roll. Each LED is individually controllable RGB. Has a printed arrow — data flows in the arrow direction. Connect to ESP32 at the AWAY-from-arrow end. Pre-soldered JST-SM connectors are a nice bonus."
            filename="ws2812b-strip.jpeg"
          />
          <PartCard
            src={P.esp32}
            name="ESP32-S3 dev board"
            role="The brain. Tiny WiFi+Bluetooth computer. Two USB-C ports — use either for flashing. The grey wire is an external IPEX antenna; ignore it for the bench, plug it in only when you mount the box on a far shelf."
            filename="esp32-s3.jpeg"
          />
          <PartCard
            src={P.psuFront}
            name="5V 10A PSU (S-50-5)"
            role="Mean Well terminal-block PSU. Skip this on build #1 (needs mains wiring). Use Path A. Comes back into play on the second carrier."
            filename="psu-5v-10a-terminals.jpeg"
            caution="L and N terminals carry 230 V — never probe live."
          />
          <PartCard
            src={P.pigtail}
            name="DC barrel pigtail"
            role="5.5×2.1 mm barrel plug → bare wire pigtail. Useful if you eventually buy a 5 V wall-wart with matching barrel jack. Not used on Path A."
            filename="dc-barrel-pigtail.jpeg"
          />
          <PartCard
            src={P.shifter}
            name="74AHCT125 level shifter ×10"
            role="Translates ESP32's 3.3 V data signal to 5 V the strip understands. You only need ONE — the rest are spares. Notch on one short edge marks pin 1. Use only buffer 1."
            filename="level-shifter-74ahct125.jpeg"
          />
          <PartCard
            src={P.caps}
            name="Capacitor kit (500 pcs)"
            role="We need exactly one 1000 µF capacitor (16 V or 25 V — both fine). Box label tells you the compartment. The leg next to the white stripe is NEGATIVE — wire it to GND."
            filename="capacitor-kit.jpeg"
            caution="Wired backwards, electrolytic caps can pop and smoke."
          />
          <PartCard
            src={P.res}
            name="Resistor kit (assorted)"
            role="We need exactly one 330 Ω resistor. 4-band code: orange · orange · brown · gold. Verify with multimeter on Ω: should read 313–347."
            filename="resistor-kit.jpeg"
          />
          <PartCard
            src={P.silicone}
            name="Silicone wire 18 AWG"
            role="Red + black spools, separate. For longer power runs (>30 cm) where Dupont wires would sag. You'll use these later when mounting the strip on the actual box."
            filename="silicone-wire-red-black.jpeg"
          />
          <PartCard
            src={P.dupont}
            name="Dupont jumpers ×120"
            role="Pre-made multi-coloured jumper wires for the breadboard. Mix of M-M, M-F, F-F. We'll only use ~10 for the bench."
            filename="dupont-jumpers.jpeg"
          />
          <PartCard
            src={P.bread}
            name="Breadboard 830-tie"
            role="Push wires in to make circuits without soldering. The two long red/blue rails on top + bottom are power rails. The middle has columns of 5 holes each, with a gap down the centre."
            filename="breadboard.jpeg"
          />
          <PartCard
            src={P.buttons}
            name="Tactile pushbuttons"
            role="Tiny 4-pin metal buttons. Pins on the same side are always connected; pressing connects the two sides. We need just ONE for the 'I picked the card' confirm button."
            filename="pushbuttons.jpeg"
          />
        </div>
      </Panel>

      {/* ── Tools ──────────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="tools" icon={<Wrench size={18} />}>Tools you have</H2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <PartCard
            src={P.iron}
            name="Soldering iron 60 W"
            role="Plug in, wait ~90 s, melt solder. Set temp to ~360 °C for the lead-free wire you have. Rest in stand when not in hand."
            filename="soldering-iron.jpeg"
            caution="Tip is 350°C+. Never on the bare bench."
          />
          <PartCard
            src={P.solder}
            name="Lead-free solder 0.8 mm"
            role="Sn99.3 Cu0.7, 2% flux core. The flux inside means no separate flux pen needed for breadboard joints."
            filename="solder-wire.jpeg"
          />
          <PartCard
            src={P.wick}
            name="Solder wick"
            role="Braided copper ribbon. When you have too much solder or a bad joint, lay the wick on it and press with the iron — it soaks up the excess. 3 reels = lots of room for mistakes."
            filename="solder-wick.jpeg"
          />
          <PartCard
            src={P.strip}
            name="Wire stripper multi-tool"
            role="Removes plastic insulation without cutting the wire. Numbered notches = wire-gauge sizes. Use 18 for silicone wire, smallest notch for thin Dupont wire."
            filename="wire-stripper-multitool.jpeg"
          />
          <PartCard
            src={P.cutters}
            name="Flush cutters"
            role="Precision cutters for snipping wire ends, resistor legs, zip-tie tails. Soft wire only — don't try to cut steel."
            filename="flush-cutters.jpeg"
          />
          <PartCard
            src={P.multi}
            name="Multimeter ANENG AN8008"
            role="Your most-used tool after the iron. Modes: V (DC) for rail check, Ω for resistor check, beep icon for continuity. Red probe in VΩHz, black always in COM."
            filename="multimeter-aneng-an8008.jpeg"
          />
          <PartCard
            src={P.shrink}
            name="Heatshrink kit"
            role="Plastic tubing in many sizes. Slide over a wire BEFORE soldering, then push over the joint and shrink with the heat gun."
            filename="heatshrink-kit.jpeg"
          />
          <PartCard
            src={P.gun}
            name="Mini heat gun 300 W"
            role="For shrinking heatshrink. Hot air ~250 °C. Hold ~5 cm away, move slowly. Do NOT use the soldering iron tip to shrink — it melts unevenly."
            filename="heat-gun.jpeg"
          />
          <PartCard
            src={P.hands}
            name="Helping hands"
            role="Alligator clips on flex arms. Holds two wires steady so you can solder them with both hands free. Don't bite stripped wire too hard — crushes the strands."
            filename="helping-hands.jpeg"
          />
        </div>
      </Panel>

      {/* ── Safety ─────────────────────────────────────────────────────── */}
      <Panel accent="var(--error)">
        <H2 id="safety" icon={<ShieldAlert size={18} />}>Safety — read once, fully</H2>
        <Note tone="danger" icon={<Zap size={16} />} title="230 V mains can kill you.">
          The five terminals labelled <Code>L</Code> · <Code>N</Code> · <Code>⏚</Code> on the
          front of the PSU, and the yellow CAUTION sticker, mark the dangerous side. The 5 V
          DC side cannot hurt you. <strong>You're using Path A on this build, so the
          mains side is safely sealed inside the wall charger.</strong>
        </Note>
        <Note tone="warn" icon={<Flame size={16} />} title="Soldering iron etiquette.">
          Tip is 350–400 °C. Always rests in the stand. Always. Most burns happen on the
          fifth joint when attention drifts. Work in a ventilated room — rosin fumes are
          mildly nasty.
        </Note>
        <Note tone="warn" icon={<Plug size={16} />} title="Power off before rewiring.">
          Always: kill power → modify → power up. Never rewire a live circuit.
        </Note>
        <Note tone="info" icon={<Info size={16} />}>
          If you smell something burning, see smoke, or hear a pop — kill the power-strip
          switch first, ask questions second.
        </Note>
      </Panel>

      {/* ── Wiring diagram ─────────────────────────────────────────────── */}
      <Panel>
        <H2 id="wiring" icon={<Plug size={18} />}>Wiring diagram</H2>
        <WiringDiagram />
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.6 }}>
          The data line goes through the level shifter (3.3 V → 5 V) and a 330 Ω resistor
          before reaching the strip. The 1000 µF cap sits across the rails near where power
          enters — it absorbs voltage dips when the strip suddenly draws current.
        </p>
      </Panel>

      {/* ── BUILD STEPS ────────────────────────────────────────────────── */}
      <div id="build" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Step 1 */}
        <Panel>
          <StepHeader
            num={1}
            icon={<Boxes size={18} />}
            title="Inspect & sort the parts"
            goal="Confirm you have everything and identify the specific resistor + capacitor you'll need."
          />
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s1-330">
              Find the <strong>330 Ω resistor</strong> in the{" "}
              <PartChip src={P.res} label="resistor kit" />. 4-band code:{" "}
              <strong>orange · orange · brown · gold</strong>. If unsure, multimeter on{" "}
              <Code>Ω</Code>: should read 313–347.
            </CheckItem>
            <CheckItem id="s1-1000uf">
              Pull <strong>one</strong> 1000 µF capacitor from the{" "}
              <PartChip src={P.caps} label="capacitor kit" />. Box label tells you the
              compartment. Note the white stripe → that leg is{" "}
              <strong style={{ color: "var(--error)" }}>negative</strong> (will go to GND).
            </CheckItem>
            <CheckItem id="s1-shifter">
              Pull <strong>one</strong> chip from the{" "}
              <PartChip src={P.shifter} label="level-shifter bag" />. Find the half-circle
              notch on one short edge — that marks pin 1. Set aside, notch facing left.
            </CheckItem>
            <CheckItem id="s1-strip-arrow">
              Find the printed arrow on the{" "}
              <PartChip src={P.led} label="LED strip" />. The bare-wire pigtail you'll connect
              is the one on the side the arrow points <strong>away from</strong>. Mark it with
              tape if you want.
            </CheckItem>
            <CheckItem id="s1-jumpers">
              From the <PartChip src={P.dupont} label="Dupont pack" />, set out 4 red M-M, 4
              black M-M, and 2 colourful M-M jumpers. Put the rest back in the bag.
            </CheckItem>
          </ul>
        </Panel>

        {/* Step 2 */}
        <Panel>
          <StepHeader
            num={2}
            icon={<BatteryCharging size={18} />}
            title="Set up the 5 V source (Path A)"
            goal="Get a clean +5 V and GND ready for the breadboard, with no exposed mains."
          />
          <Note tone="info" icon={<Lightbulb size={16} />} title="Why we're not using your PSU yet">
            The terminal-block PSU you bought is great — but it requires assembling a Schuko
            plug yourself. Doable, scary first time. We'll bring it in for build #2.
          </Note>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s2-cable">
              Find an old USB-A cable you don't need (any phone-charger cable from the last 10
              years works). Cut the <strong>USB-A connector</strong> off the end (the
              rectangular metal plug, not the small device-end).
            </CheckItem>
            <CheckItem id="s2-strip">
              Use the <PartChip src={P.strip} label="wire stripper" /> on its smallest notch
              to remove ~10 mm of the outer black/grey jacket. Inside you'll find 4 wires:{" "}
              <strong style={{ color: "#ef4444" }}>red (+5 V)</strong>,{" "}
              <strong>black (GND)</strong>, white (data), green (data). Snip white + green
              short with the <PartChip src={P.cutters} label="flush cutters" /> — we don't use
              them.
            </CheckItem>
            <CheckItem id="s2-strip-rb">
              Strip ~5 mm off the red and black wires. Twist the strands tight. Optional but
              helpful: tin them with a quick touch of <PartChip src={P.iron} label="iron" /> +{" "}
              <PartChip src={P.solder} label="solder" /> so they hold their shape going into
              the breadboard.
            </CheckItem>
            <CheckItem id="s2-test">
              Plug the charger into the wall. Set the{" "}
              <PartChip src={P.multi} label="multimeter" /> to <Code>DC V</Code> (~20 V
              range). Red probe on the red wire, black probe on the black wire — should read{" "}
              <strong>~5.0 V</strong>. <strong>Reverse the probes</strong> — should read{" "}
              <strong>−5.0 V</strong>. If both are 0, the cable is dead.
            </CheckItem>
            <CheckItem id="s2-unplug">
              <strong>Unplug from the wall</strong> before continuing.
            </CheckItem>
          </ul>
        </Panel>

        {/* Step 3 */}
        <Panel>
          <StepHeader
            num={3}
            icon={<Zap size={18} />}
            title="Build the 5 V rail on the breadboard"
            goal="Get +5 V and GND running along the long red and blue rails, with a decoupling cap in place."
          />
          <Note tone="warn" title="Power-strip OFF the entire time of this step.">
            We're only physically placing parts. No power until step 4's smoke test.
          </Note>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s3-orient">
              Orient the <PartChip src={P.bread} label="breadboard" /> with labels readable.
              Top long rows: red <Code>+</Code> and blue <Code>−</Code>. Mirror at bottom.
            </CheckItem>
            <CheckItem id="s3-source">
              Push the <strong>red wire</strong> from the cut USB cable into any hole on the
              top red <Code>+</Code> rail (left end). Push the{" "}
              <strong>black wire</strong> into the top blue <Code>−</Code> rail (same area).
            </CheckItem>
            <CheckItem id="s3-bridge">
              Bridge top → bottom: a red Dupont from top-red far-right to bottom-red far-right;
              a black Dupont from top-blue far-right to bottom-blue far-right. Now both rails
              are powered evenly.
            </CheckItem>
            <CheckItem id="s3-cap">
              Place the <strong>1000 µF cap</strong>: white-stripe leg →{" "}
              <strong>blue rail (GND)</strong>. Other leg → <strong>red rail (+5 V)</strong>.
              Put it within 5 cm of where the source enters.
            </CheckItem>
          </ul>
          <Note tone="danger" icon={<AlertTriangle size={16} />} title="Capacitor polarity is the #1 way beginners destroy components.">
            White stripe = negative = goes to GND/blue rail. Read it twice before you turn
            power on.
          </Note>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s3-smoke">
              <strong>Smoke test:</strong> plug charger in. Multimeter on <Code>DC V</Code> —
              should read <strong>4.95–5.10 V</strong> across the rails. If negative, polarity
              is swapped. If 0, source isn't connected. Unplug and fix.
            </CheckItem>
            <CheckItem id="s3-off">Power off before continuing.</CheckItem>
          </ul>
        </Panel>

        {/* Step 4 */}
        <Panel>
          <StepHeader
            num={4}
            icon={<Cpu size={18} />}
            title="Seat the ESP32 and the level shifter"
            goal="Mount both ICs on the breadboard, give them power, wire the data signal from ESP32 → shifter."
          />
          <H3>Seat the ESP32</H3>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s4-esp-seat">
              Position the <PartChip src={P.esp32} label="ESP32-S3" /> straddling the central
              gap. Half its pins on each side. USB-C connectors overhang the <strong>left</strong>{" "}
              end. Press straight down with thumbs along both edges.{" "}
              <strong>Don't rock side-to-side</strong> — bends the pins.
            </CheckItem>
            <CheckItem id="s4-esp-power">
              Find the <Code>5V</Code> (or <Code>VIN</Code>) pin near the USB end. Run a red
              Dupont from the column next to that pin to the red <Code>+</Code> rail. Run a
              black Dupont from any <Code>GND</Code> pin to the blue <Code>−</Code> rail.
            </CheckItem>
            <CheckItem id="s4-esp-data">
              Find <Code>GPIO5</Code> (sometimes <Code>IO5</Code>). Run a green or yellow
              Dupont from there to a free column in the middle of the board — leave the other
              end loose for now.
            </CheckItem>
          </ul>
          <H3>Seat the level shifter</H3>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s4-shift-seat">
              Press the <PartChip src={P.shifter} label="74AHCT125" /> into the breadboard
              straddling the central gap, <strong>notch facing left</strong>. Pins 1–7 on one
              side, pins 8–14 on the other. Push on the plastic body, not the pins.
            </CheckItem>
            <CheckItem id="s4-shift-vcc">
              <strong>Pin 14</strong> (top-right, next to the notch on top) →{" "}
              <Code>+</Code> rail. <strong>Pin 7</strong> (bottom-left) → <Code>−</Code> rail.
            </CheckItem>
            <CheckItem id="s4-shift-oe">
              Tie unused enables low: <strong>Pin 4, Pin 10, Pin 13</strong> → all to{" "}
              <Code>−</Code> rail with three short black jumpers.
            </CheckItem>
            <CheckItem id="s4-shift-data">
              Connect the loose end of the GPIO5 Dupont to <strong>shifter pin 2</strong>{" "}
              (the input of buffer 1).
            </CheckItem>
          </ul>
          <Note>
            The notch end of a DIP chip is always pin 1. Pin numbers go counter-clockwise
            looking down on the chip: pin 1 is bottom-left of the notch, pin 14 is top-left.
          </Note>
        </Panel>

        {/* Step 5 */}
        <Panel>
          <StepHeader
            num={5}
            icon={<Lightbulb size={18} />}
            title="Connect the LED strip"
            goal="Wire the strip's input end (the AWAY-from-arrow end) to the breadboard."
          />
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s5-verify">
              Look at the bare end of the <PartChip src={P.led} label="strip" /> under the
              JST connector. The pads are labelled <Code>5V</Code>, <Code>DI</Code> (or{" "}
              <Code>DIN</Code>), <Code>GND</Code>. Note which colour wire goes to which pad.
              Typical mapping: <strong style={{ color: "#ef4444" }}>red→5V</strong>,{" "}
              <strong style={{ color: "var(--warning)" }}>white→DI</strong>,{" "}
              <strong>green→GND</strong>. Verify against your specific roll.
            </CheckItem>
            <CheckItem id="s5-strip">
              Strip 5 mm off each of the three wires. Twist tight, optionally tin them.
            </CheckItem>
            <CheckItem id="s5-5v">
              Strip's 5 V wire → red <Code>+</Code> rail.
            </CheckItem>
            <CheckItem id="s5-gnd">
              Strip's GND wire → blue <Code>−</Code> rail.
            </CheckItem>
            <CheckItem id="s5-data">
              Strip's data wire (<Code>DI</Code>) → through the{" "}
              <strong>330 Ω resistor</strong> → <strong>shifter pin 3</strong> (output of
              buffer 1). On the breadboard: plug the resistor across two adjacent columns.
              One leg in the column connected to shifter pin 3. Other leg in a free column.
              Plug a Dupont from that free column to the strip's <Code>DI</Code> wire.
            </CheckItem>
          </ul>
          <Note title="Why the 330 Ω resistor?">
            Protects the first LED's input chip from voltage spikes when you plug/unplug
            the strip. Standard precaution. Without it, the first LED occasionally dies on
            connect.
          </Note>
        </Panel>

        {/* Step 6 */}
        <Panel>
          <StepHeader
            num={6}
            icon={<AlertTriangle size={18} />}
            title="Pre-power smoke test"
            goal="Confirm there are no shorts before applying any power. Confirm voltages once we do."
          />
          <H3>While power is OFF — continuity (🔊) checks</H3>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s6-no-short">
              Probe red <Code>+</Code> rail and blue <Code>−</Code> rail. <strong>Should NOT
              beep.</strong> If it does, you have a short — find and remove the bridging wire
              before going further.
            </CheckItem>
            <CheckItem id="s6-strip-5v">
              ESP32 <Code>5V</Code> pin and the strip's 5 V wire — should beep (same rail).
            </CheckItem>
            <CheckItem id="s6-strip-gnd">
              ESP32 <Code>GND</Code> and strip's GND — should beep.
            </CheckItem>
            <CheckItem id="s6-data-path">
              ESP32 <Code>GPIO5</Code> → shifter pin 2 — should beep.
            </CheckItem>
            <CheckItem id="s6-resistor">
              Shifter pin 3 → strip's DIN — through the resistor: continuity may be quiet on
              some meters; switch to <Code>Ω</Code> mode and confirm reading is ~330.
            </CheckItem>
          </ul>
          <H3>Apply power</H3>
          <ul style={{ padding: 0, margin: 0 }}>
            <CheckItem id="s6-rails">
              Plug charger in. Multimeter on <Code>DC V</Code> across the rails:{" "}
              <strong>~5.00 V</strong> ✓
            </CheckItem>
            <CheckItem id="s6-shifter-power">
              Across shifter pin 14 and pin 7: <strong>~5.00 V</strong> ✓
            </CheckItem>
            <CheckItem id="s6-strip-power">
              Across the strip's 5 V and GND wires: <strong>~5.00 V</strong> ✓
            </CheckItem>
            <CheckItem id="s6-esp-usb">
              Plug the ESP32 into your computer with the USB-C cable. Two on-board LEDs
              should glow (red power LED + RGB pulsing). Strip stays <strong>dark</strong>{" "}
              (no firmware yet).
            </CheckItem>
            <CheckItem id="s6-power-off">
              Power off the charger before moving to firmware.
            </CheckItem>
          </ul>
        </Panel>

      </div>

      {/* ── MQTT broker ────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="mqtt-broker" icon={<Radio size={18} />}>Step 7 — Set up MQTT (HiveMQ free)</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          The cloud "messaging server" that connects your dashboard to the ESP32. Free tier,
          no credit card.
        </p>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="mqtt-signup">
            Sign up at{" "}
            <a
              href="https://console.hivemq.cloud"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              console.hivemq.cloud <ExternalLink size={11} />
            </a>{" "}
            with email + password.
          </CheckItem>
          <CheckItem id="mqtt-cluster">
            Create a <Code>Serverless Cluster</Code>, region <strong>EU</strong>. Copy the
            broker URL (looks like <Code>abc123.s1.eu.hivemq.cloud</Code>) — you'll paste it
            into firmware.
          </CheckItem>
          <CheckItem id="mqtt-user-device">
            Add user <Code>misstep-device</Code>, strong password. Permission:{" "}
            <strong>Publish and Subscribe</strong> on <Code>misstep/#</Code>.
          </CheckItem>
          <CheckItem id="mqtt-user-dash">
            Add a second user <Code>misstep-dashboard</Code>, separate password, same
            permission scope. Two users so you can rotate one without breaking the other.
          </CheckItem>
          <CheckItem id="mqtt-test">
            From the WebSocket Client tab: connect with <Code>misstep-dashboard</Code>,
            subscribe to <Code>misstep/#</Code>, publish to <Code>misstep/storage/test</Code>.
            You should see your own message come back instantly.
          </CheckItem>
        </ul>
      </Panel>

      {/* ── Firmware ───────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="firmware" icon={<CodeIcon size={18} />}>Step 8 — Firmware (ESPHome)</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          ESPHome is a Python tool. It compiles a YAML config into ESP32 firmware and flashes
          it via USB-C. Way easier than writing C++.
        </p>

        <H3>Install ESPHome</H3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>
          You need Python 3.9+. Check with <Code>python --version</Code>. Install from{" "}
          <a
            href="https://www.python.org/downloads/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            python.org
          </a>{" "}
          if missing (tick "Add Python to PATH").
        </p>
        <Pre lang="powershell">{`pip install esphome
esphome version`}</Pre>

        <H3>Create folder + secrets</H3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>
          Make a folder (e.g. <Code>C:\misstep-firmware\</Code>). Inside it, create{" "}
          <Code>secrets.yaml</Code>:
        </p>
        <Pre lang="yaml">{`wifi_ssid: "YOUR_2.4_GHZ_WIFI_NAME"
wifi_password: "..."
api_key: "32-char-base64-any-value"
ota_password: "pick-something"
mqtt_broker: "abc123.s1.eu.hivemq.cloud"
mqtt_username: "misstep-device"
mqtt_password: "..."`}</Pre>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Generate a 32-char <Code>api_key</Code> in PowerShell with:
        </p>
        <Pre lang="powershell">{`[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))`}</Pre>

        <H3>Config file — <Code>misstep-storage-01.yaml</Code></H3>
        <Pre lang="yaml">{`esphome:
  name: misstep-storage-01
  platform: ESP32
  board: esp32-s3-devkitc-1

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
  encryption:
    key: !secret api_key

ota:
  - platform: esphome
    password: !secret ota_password

mqtt:
  broker: !secret mqtt_broker
  port: 8883                  # TLS, NOT 1883
  username: !secret mqtt_username
  password: !secret mqtt_password
  topic_prefix: misstep/storage/misstep-storage-01

light:
  - platform: neopixelbus
    variant: WS2812
    pin: GPIO5
    num_leds: 432             # 3 m × 144/m. Adjust to your strip length.
    rgb_order: GRB
    name: "Storage strip"
    id: storage_strip
    restore_mode: ALWAYS_OFF

binary_sensor:
  - platform: gpio
    pin:
      number: GPIO4
      mode: INPUT_PULLUP
      inverted: true
    name: "Pull confirm"
    on_press:
      then:
        - mqtt.publish:
            topic: misstep/storage/misstep-storage-01/pull-complete
            payload: '{"deviceId":"misstep-storage-01"}'`}</Pre>

        <H3>Flash</H3>
        <Pre lang="powershell">{`# First flash (USB-C cable required)
esphome run misstep-storage-01.yaml

# Subsequent flashes go over the air once WiFi is up`}</Pre>
        <Note tone="warn" icon={<Cpu size={16} />} title="If flashing times out:">
          Hold the <Code>BOOT</Code> button on the ESP32 while plugging in USB-C, release
          after 1 second, then re-run the command. Some boards refuse to enter download
          mode otherwise.
        </Note>
      </Panel>

      {/* ── First light ────────────────────────────────────────────────── */}
      <Panel accent="var(--success)">
        <H2 id="first-light" icon={<Lightbulb size={18} />}>Step 9 — First light 🟢</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          The magic moment. Send a colour command from the cloud and watch the strip light
          up.
        </p>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="fl-watch">
            In HiveMQ console → WebSocket Client tab, connect with the{" "}
            <Code>misstep-dashboard</Code> credentials. Subscribe to{" "}
            <Code>misstep/storage/misstep-storage-01/#</Code>. You should see the device's
            heartbeat messages.
          </CheckItem>
          <CheckItem id="fl-publish">
            Publish to <Code>misstep/storage/misstep-storage-01/light/command</Code> with
            payload:
            <Pre lang="json">{`{"state":"ON","color":{"r":0,"g":255,"b":0},"transition":0,"effect":"None"}`}</Pre>
            The whole strip should turn <strong style={{ color: "var(--success)" }}>green</strong>.
            <strong> That's the milestone. Take a photo.</strong>
          </CheckItem>
          <CheckItem id="fl-colours">
            Try other colours by changing the <Code>r</Code>/<Code>g</Code>/<Code>b</Code>{" "}
            numbers (0–255 each).
          </CheckItem>
          <CheckItem id="fl-off">
            Turn off: <Code>{`{"state":"OFF"}`}</Code>.
          </CheckItem>
        </ul>
        <H3>Test the button</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="fl-btn-place">
            Place a <PartChip src={P.buttons} label="pushbutton" /> straddling the breadboard
            centre gap.
          </CheckItem>
          <CheckItem id="fl-btn-wire">
            One pin → ESP32 <Code>GPIO4</Code>. One pin on the OTHER side → blue{" "}
            <Code>−</Code> rail (GND).
          </CheckItem>
          <CheckItem id="fl-btn-press">
            Press the button. A message should appear on{" "}
            <Code>misstep/storage/misstep-storage-01/pull-complete</Code> in the WebSocket
            client.
          </CheckItem>
        </ul>
      </Panel>

      {/* ── Power injection ────────────────────────────────────────────── */}
      <Panel>
        <H2 icon={<BatteryCharging size={18} />}>When long strips look wrong (later)</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Won't hit you on the bench. Once you mount 432 LEDs:
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <strong>Symptom:</strong> colours drift past ~1.5 m. Whites look pink, pinks look
          orange. First half of the strip fine, far end isn't.
          <br />
          <strong>Cause:</strong> voltage drop. 5 V at one end becomes 4.6 V at the other at
          high brightness; LEDs need ≥4.5 V.
          <br />
          <strong>Fix:</strong> solder fresh +5 V and GND wires from the PSU directly to the
          strip's pads at the 1.5 m and 3 m points. Data signal continues uninterrupted. No
          firmware change.
          <br />
          <strong>Until then:</strong> just run at 30–50% brightness — for indicator use,
          you'll only have 1–10 LEDs lit at a time anyway.
        </p>
      </Panel>

      {/* ── Troubleshooting ────────────────────────────────────────────── */}
      <Panel>
        <H2 id="trouble" icon={<AlertTriangle size={18} />}>Troubleshooting</H2>

        <H3>Strip stays completely dark</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-dark-power">
            Multimeter on <Code>DC V</Code> across the strip's 5V/GND pads at the input.
            Should read ~5 V. If 0 V, rail wiring is wrong.
          </CheckItem>
          <CheckItem id="ts-dark-arrow">
            Arrow on the strip must point AWAY from the end you connected. If you wired the
            wrong end, no data can flow. Move connections to the other end.
          </CheckItem>
          <CheckItem id="ts-dark-trace">
            Continuity-trace from ESP32 GPIO5 → shifter pin 2 → resistor → strip DIN. Re-seat
            any flaky breadboard jumper.
          </CheckItem>
          <CheckItem id="ts-dark-shifter">
            Shifter powered? <Code>DC V</Code> between pin 14 and pin 7 should read ~5 V. If
            0, the chip's power jumpers are missing.
          </CheckItem>
        </ul>

        <H3>First LED works, the rest are wrong colours / dead</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-shift-skipped">
            Almost always: you skipped the level shifter. The ESP32's 3.3 V signal works at
            short distances, but fails at 144/m density. Make sure GPIO5 → shifter pin 2 →
            pin 3 → 330 Ω → strip DIN, and shifter pin 14 is at 5 V.
          </CheckItem>
          <CheckItem id="ts-rgb-order">
            Red and green swapped? Strip uses GRB by default, but some rolls are RGB or BRG.
            Try changing <Code>rgb_order: GRB</Code> in the YAML to <Code>RGB</Code> or{" "}
            <Code>BRG</Code> until colours match.
          </CheckItem>
        </ul>

        <H3>ESP32 won't connect to WiFi</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-wifi-band">
            ESP32-S3 is <strong>2.4 GHz only</strong>. If your router broadcasts a single
            SSID for both bands, it may silently push the ESP32 to 5 GHz on first connect.
            Temporarily disable 5 GHz, or create a 2.4-only guest network.
          </CheckItem>
          <CheckItem id="ts-wifi-creds">
            Re-check SSID/password in <Code>secrets.yaml</Code>. No quotes inside the value,
            no trailing spaces.
          </CheckItem>
        </ul>

        <H3>Device won't connect to MQTT</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-mqtt-port">
            Port <strong>8883</strong>, not 1883. HiveMQ free tier is TLS-only.
          </CheckItem>
          <CheckItem id="ts-mqtt-creds">
            Re-paste username/password from HiveMQ — typing them is a common typo source.
          </CheckItem>
          <CheckItem id="ts-mqtt-cluster">
            Free clusters get suspended after long inactivity. Refresh the HiveMQ dashboard
            to wake it up.
          </CheckItem>
        </ul>

        <H3>Solder joint looks rough or dull</H3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          That's a "cold joint". Reheat with the iron, let the solder reflow shiny. Heat the{" "}
          <em>parts</em> first, then touch the solder to the parts (not the iron tip).
        </p>
      </Panel>

      {/* ── What's next ────────────────────────────────────────────────── */}
      <Panel accent="var(--accent)">
        <H2 id="next" icon={<Rocket size={18} />}>What comes after this works</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Once first-light + button-press both work, the bench prototype is complete. Next:
        </p>
        <ol
          style={{
            paddingLeft: 22,
            margin: 0,
            color: "var(--text-primary)",
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          <li>
            <strong>Build one carrier (the box-carrier-cap sandwich).</strong> Plywood tray,
            aluminium cap rail, two back posts, drawer slides. Mount the strip permanently
            under the cap.
          </li>
          <li>
            <strong>Wire mains via Path B.</strong> The terminal-block PSU + Schuko plug, now
            you've earned it.
          </li>
          <li>
            <strong>Dashboard side:</strong>
            <ul style={{ marginTop: 4 }}>
              <li>
                New collection <Code>dashboard_storage_devices</Code> — deviceId, label,
                scopes, ledOffset.
              </li>
              <li>
                Slot → LED resolver (pure function mirroring{" "}
                <Code>readingDirection</Code> in <Code>lib/storage.ts</Code>).
              </li>
              <li>
                <Code>POST /api/storage/light</Code> — takes <Code>{"{slotKeys, mode, ttl}"}</Code>,
                resolves to device + LED addresses, publishes to MQTT.
              </li>
              <li>
                Calibration UI — click a slot in the 3D shelf render, the LED lights, you
                enter the observed LED index.
              </li>
              <li>
                "Light slot" button on Stock rows (white, 60 s TTL).
              </li>
              <li>
                "Pull order" button on Cardmarket order detail (green, 5 min, button-press
                clears + decrements stock).
              </li>
            </ul>
          </li>
          <li>
            <strong>Build a second carrier</strong>, validate the wiring style, then scale to
            the full grid (~25 boxes).
          </li>
        </ol>
        <Note tone="success" icon={<Sparkles size={16} />} title="Send photos at first-light.">
          The first carrier always has rough edges; the second is where the real engineering
          choices land.
        </Note>
      </Panel>

      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          padding: "8px 0 24px",
        }}
      >
        bookmark <Code>/system/storage-setup</Code> on your phone for bench reference
      </p>
    </div>
  );
}
