"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Zap,
  Wifi,
  Flame,
  Cable,
  Cpu,
  Lightbulb,
  HardHat,
} from "lucide-react";

// Tiny helper for a section surface — matches the rest of the dashboard.
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-4 sm:p-6"
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
      }}
    >
      {children}
    </div>
  );
}

function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 16,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "0 0 12px",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        margin: "16px 0 8px",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        background: "rgba(0,0,0,0.3)",
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

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-primary)",
        overflowX: "auto",
        margin: "8px 0",
        lineHeight: 1.5,
      }}
    >
      {children}
    </pre>
  );
}

function Note({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette = {
    info: { bg: "rgba(63,206,229,0.06)", border: "rgba(63,206,229,0.25)", color: "var(--accent)" },
    warn: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.25)", color: "#fbbf24" },
    danger: {
      bg: "rgba(252,165,165,0.06)",
      border: "rgba(252,165,165,0.25)",
      color: "var(--error, #fca5a5)",
    },
  }[tone];
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--text-secondary)",
        margin: "8px 0",
      }}
    >
      <span style={{ color: palette.color, flexShrink: 0, marginTop: 2 }}>
        {icon ?? <AlertTriangle size={14} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// Persistent checklist — stores progress in localStorage so refreshing
// the page doesn't wipe what you've already done.
function CheckItem({ id, children }: { id: string; children: React.ReactNode }) {
  const storageKey = `misstep:storage-setup:${id}`;
  const [done, setDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });
  function toggle() {
    const next = !done;
    setDone(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }
  return (
    <li
      onClick={toggle}
      style={{
        listStyle: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        cursor: "pointer",
        color: done ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: done ? "line-through" : "none",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        {done ? (
          <CheckCircle2 size={14} style={{ color: "var(--success)" }} />
        ) : (
          <Circle size={14} style={{ color: "var(--text-muted)" }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </li>
  );
}

/**
 * Inline SVG wiring diagram for the single-box test build. Kept simple
 * enough to read on a phone screen; each node is labeled, each wire color
 * corresponds to common convention (red=5V, black=GND, green=data).
 */
function WiringDiagram() {
  return (
    <svg
      viewBox="0 0 640 420"
      style={{
        width: "100%",
        maxWidth: 640,
        height: "auto",
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: 8,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          .box { fill: rgba(255,255,255,0.04); stroke: rgba(255,255,255,0.2); stroke-width: 1.5; rx: 6; }
          .label { fill: #f1f5f9; font-family: monospace; font-size: 11px; font-weight: 600; }
          .pin { fill: #94a3b8; font-family: monospace; font-size: 10px; }
          .wire-r { stroke: #ef4444; stroke-width: 2; fill: none; }
          .wire-k { stroke: #94a3b8; stroke-width: 2; fill: none; }
          .wire-g { stroke: #34d399; stroke-width: 2; fill: none; }
          .wire-dash { stroke-dasharray: 3 3; }
          .cap { fill: rgba(251,191,36,0.25); stroke: #fbbf24; stroke-width: 1.2; }
          .res { fill: rgba(63,206,229,0.2); stroke: #3fcee5; stroke-width: 1.2; }
          .note { fill: #64748b; font-family: monospace; font-size: 10px; }
        `}</style>
      </defs>

      {/* PSU */}
      <rect x="20" y="30" width="140" height="80" className="box" />
      <text x="90" y="60" textAnchor="middle" className="label">5V 10A PSU</text>
      <text x="90" y="76" textAnchor="middle" className="pin">AC in (Schuko)</text>
      <text x="90" y="92" textAnchor="middle" className="pin">DC out (barrel)</text>

      {/* Barrel pigtail → rails */}
      <text x="175" y="60" className="pin">+5V</text>
      <text x="175" y="95" className="pin">GND</text>
      <path d="M 160 55 L 200 55" className="wire-r" />
      <path d="M 160 90 L 200 90" className="wire-k" />

      {/* Cap (decoupling) */}
      <circle cx="215" cy="72" r="10" className="cap" />
      <text x="215" y="76" textAnchor="middle" className="pin">1000µF</text>

      {/* Rails */}
      <path d="M 200 55 L 600 55" className="wire-r" />
      <path d="M 200 90 L 600 90" className="wire-k" />
      <text x="610" y="58" className="pin">+5V rail</text>
      <text x="610" y="93" className="pin">GND rail</text>

      {/* ESP32 */}
      <rect x="220" y="150" width="160" height="90" className="box" />
      <text x="300" y="180" textAnchor="middle" className="label">ESP32-S3</text>
      <text x="300" y="196" textAnchor="middle" className="pin">5V · GND · GPIO5</text>
      <text x="300" y="212" textAnchor="middle" className="pin">USB-C for flashing</text>
      <text x="300" y="228" textAnchor="middle" className="note">WiFi 2.4GHz</text>

      {/* ESP32 power */}
      <path d="M 240 150 L 240 55" className="wire-r" />
      <path d="M 280 150 L 280 90" className="wire-k" />

      {/* Level shifter */}
      <rect x="240" y="270" width="120" height="60" className="box" />
      <text x="300" y="295" textAnchor="middle" className="label">74AHCT125</text>
      <text x="300" y="311" textAnchor="middle" className="pin">3.3V in → 5V out</text>

      {/* ESP32 GPIO5 → shifter */}
      <path d="M 320 240 L 320 270" className="wire-g" />

      {/* Shifter power */}
      <path d="M 250 270 L 250 150 Z" className="wire-k wire-dash" />
      <path d="M 350 270 L 350 55 Z" className="wire-r wire-dash" />

      {/* Resistor */}
      <rect x="400" y="285" width="40" height="20" className="res" />
      <text x="420" y="299" textAnchor="middle" className="pin">330Ω</text>
      <path d="M 360 295 L 400 295" className="wire-g" />

      {/* Data to strip */}
      <path d="M 440 295 L 520 295" className="wire-g" />

      {/* LED strip */}
      <rect x="520" y="270" width="100" height="60" className="box" />
      <text x="570" y="295" textAnchor="middle" className="label">WS2812B</text>
      <text x="570" y="311" textAnchor="middle" className="pin">DIN · 5V · GND</text>

      {/* Strip power from rails */}
      <path d="M 580 270 L 580 55" className="wire-r" />
      <path d="M 560 270 L 560 90" className="wire-k" />

      {/* Legend */}
      <rect x="20" y="370" width="18" height="3" fill="#ef4444" />
      <text x="45" y="374" className="note">+5V</text>
      <rect x="85" y="370" width="18" height="3" fill="#94a3b8" />
      <text x="110" y="374" className="note">GND</text>
      <rect x="150" y="370" width="18" height="3" fill="#34d399" />
      <text x="175" y="374" className="note">Data (DIN)</text>
    </svg>
  );
}

export default function StorageSetupContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Storage setup — one-box test
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            margin: "6px 0 0",
            maxWidth: 720,
          }}
        >
          Step-by-step to wire one 4k box with an LED strip driven by an ESP32
          talking MQTT to the dashboard. Goal: click a slot in the Stock
          table, the matching LED lights up. Everything here runs without the
          production cap — duct-tape the strip to the box edge for the MVP.
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            margin: "12px 0 0",
            fontFamily: "var(--font-mono)",
          }}
        >
          Tap items to check them off — progress persists in your browser.
        </p>
      </div>

      {/* ── Bill of materials ──────────────────────────────────────────── */}
      <Panel>
        <H2 id="bom">Bill of materials</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
          AliExpress, Portugal. Order everything in one cart so shipping
          consolidates. Expect 2-3 weeks to arrive.
        </p>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="bom-strip">
            <strong>WS2812B strip</strong> — 144 LEDs/m · IP30 · black PCB · 3m
            · 5V · ordered
          </CheckItem>
          <CheckItem id="bom-esp32">
            <strong>ESP32-S3-DevKitC-1 N16R8</strong> — Type-C USB
          </CheckItem>
          <CheckItem id="bom-psu">
            <strong>5V 10A SMPS PSU</strong> — <Code>EU Schuko plug</Code>{" "}
            variant, 100-240V AC universal input
          </CheckItem>
          <CheckItem id="bom-pigtail">
            DC barrel pigtail, 5.5×2.1mm, 30cm
          </CheckItem>
          <CheckItem id="bom-shifter">
            74AHCT125 or 74HCT125 level shifter (DIP-14)
          </CheckItem>
          <CheckItem id="bom-kit">
            Resistor + capacitor combined kit (must include{" "}
            <Code>330Ω</Code> and <Code>1000µF 16V</Code>)
          </CheckItem>
          <CheckItem id="bom-wire">
            18AWG silicone wire, 5m red + 5m black spools (separate)
          </CheckItem>
          <CheckItem id="bom-dupont">
            Dupont jumper wires, 20cm, 120pcs assortment (M-M, M-F, F-F)
          </CheckItem>
          <CheckItem id="bom-bread">Breadboard, 830 tie-point</CheckItem>
          <CheckItem id="bom-buttons">
            Tactile pushbuttons 6×6×5mm, 20-pack (only need 1 for MVP)
          </CheckItem>
          <CheckItem id="bom-usbc">
            USB-C cable (for flashing ESP32)
          </CheckItem>
        </ul>
        <H3>Tools (one-time)</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="tool-iron">
            Soldering iron kit, 60W, adjustable temp, EU plug
          </CheckItem>
          <CheckItem id="tool-solder">
            Solder wire 0.8mm, 60/40 rosin-core
          </CheckItem>
          <CheckItem id="tool-flux">Rosin flux paste or flux pen</CheckItem>
          <CheckItem id="tool-strippers">Self-adjusting wire strippers</CheckItem>
          <CheckItem id="tool-cutters">Flush cutters</CheckItem>
          <CheckItem id="tool-multi">
            Digital multimeter — <Code>ANENG AN8008</Code> (auto-ranging, true
            RMS)
          </CheckItem>
          <CheckItem id="tool-heatshrink">Heatshrink tubing assortment</CheckItem>
          <CheckItem id="tool-heatgun">Mini heat gun 300W (or lighter)</CheckItem>
          <CheckItem id="tool-hands">Helping hands / PCB holder</CheckItem>
          <CheckItem id="tool-wick">Solder wick / desoldering braid</CheckItem>
        </ul>
      </Panel>

      {/* ── Safety ──────────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="safety">Safety first</H2>
        <Note tone="danger" icon={<Zap size={14} />}>
          <strong>Mains (230V) side of the PSU is lethal.</strong> Do not probe
          the AC input pins. Plug it in only after the DC output is wired and
          the lid is closed (if it has one).
        </Note>
        <Note tone="warn" icon={<Flame size={14} />}>
          Soldering iron tip sits at 350-400°C. Rest it on a stand — never on
          the bench. Work in ventilated space; rosin fumes aren&apos;t
          friendly.
        </Note>
        <Note tone="warn" icon={<HardHat size={14} />}>
          Don&apos;t wire or rewire anything while the PSU is plugged in. Kill
          power, then modify, then power up.
        </Note>
      </Panel>

      {/* ── Wiring diagram ────────────────────────────────────────────── */}
      <Panel>
        <H2 id="wiring">Wiring diagram</H2>
        <WiringDiagram />
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "12px 0 0" }}>
          Red = +5V, grey = GND, green = data. Dashed lines = power to
          auxiliary components (level shifter).
        </p>
      </Panel>

      {/* ── Build steps ────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="build">Build — bench assembly</H2>

        <H3>1. Prep the PSU</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="build-psu-plug">
            Confirm PSU has <strong>EU Schuko plug</strong> and says{" "}
            <Code>100-240V</Code> input on the label.
          </CheckItem>
          <CheckItem id="build-psu-strip">
            If PSU has bare leads (no plug): don&apos;t use it yet — get a DC
            pigtail or buy one with built-in Schuko cord.
          </CheckItem>
          <CheckItem id="build-psu-polarity">
            Check pigtail polarity with the multimeter on <Code>DC V</Code>{" "}
            mode before wiring — red probe on inner pin of barrel plug, black
            on outer sleeve. Should read near 0V with PSU unplugged; +5V once
            you plug the PSU in for the test. Unplug again afterwards.
          </CheckItem>
        </ul>

        <H3>2. Wire the 5V rail on the breadboard</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="build-rail-pigtail">
            Strip ~6mm of insulation off both pigtail leads. Tin them with the
            iron.
          </CheckItem>
          <CheckItem id="build-rail-5v">
            Red pigtail lead → breadboard <Code>+</Code> rail (long red line).
          </CheckItem>
          <CheckItem id="build-rail-gnd">
            Black pigtail lead → breadboard <Code>-</Code> rail (long blue
            line).
          </CheckItem>
          <CheckItem id="build-rail-cap">
            Place the <Code>1000µF 16V</Code> cap across the rails near where
            the pigtail enters — <strong>watch polarity</strong>: the cap&apos;s
            stripe/minus leg goes on GND.
          </CheckItem>
        </ul>
        <Note tone="warn">
          A 1000µF cap installed backwards can pop loudly and smoke. The white
          stripe on the can is the <em>negative</em> side; that leg goes to
          GND.
        </Note>

        <H3>3. Seat the ESP32 and level shifter</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="build-esp-seat">
            Press the ESP32-S3 into the breadboard straddling the center gap.
            Half the pins on each side.
          </CheckItem>
          <CheckItem id="build-esp-power">
            Jumper from ESP32 <Code>5V</Code> pin to breadboard <Code>+</Code>{" "}
            rail; from <Code>GND</Code> pin to <Code>-</Code> rail.
          </CheckItem>
          <CheckItem id="build-shifter-seat">
            Seat the 74AHCT125 (DIP-14) on the breadboard, notch to the left.
          </CheckItem>
          <CheckItem id="build-shifter-vcc">
            Pin 14 (VCC) → <Code>+</Code> rail. Pin 7 (GND) → <Code>-</Code>{" "}
            rail.
          </CheckItem>
          <CheckItem id="build-shifter-oe">
            Pins 1, 4, 10, 13 (all <Code>OE</Code> enables) → <Code>-</Code>{" "}
            rail to keep the outputs always enabled.
          </CheckItem>
          <CheckItem id="build-shifter-signal">
            ESP32 <Code>GPIO5</Code> → 74AHCT125 pin 2 (A1, input); pin 3 (Y1,
            output) → <Code>330Ω</Code> resistor → strip <Code>DIN</Code>.
          </CheckItem>
        </ul>

        <H3>4. Solder leads to the LED strip</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="build-strip-cut">
            The strip has solder pads every 1cm or so labeled{" "}
            <Code>5V · DIN · GND</Code>. Don&apos;t cut yet — work with the
            full 3m roll until you&apos;ve tested end-to-end.
          </CheckItem>
          <CheckItem id="build-strip-solder">
            Tin the three pads on the <strong>input</strong> end (look for the
            arrow printed on the strip — data flows <em>away</em> from the
            arrow). Solder a short red/green/black wire trio.
          </CheckItem>
          <CheckItem id="build-strip-wires">
            Strip ends: red → breadboard <Code>+</Code> rail · black →{" "}
            <Code>-</Code> rail · green → junction after the 330Ω resistor.
          </CheckItem>
          <CheckItem id="build-strip-mount">
            Duct-tape the strip flat on the box for now. Production cap comes
            later.
          </CheckItem>
        </ul>
        <Note>
          If the data arrow is ambiguous on your strip, remember: the pads
          without the arrow next to them are the <strong>input</strong> side.
          Data always flows in the direction the arrows point.
        </Note>

        <H3>5. Pre-power smoke test</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="build-check-shorts">
            Multimeter on continuity (beep) mode: probe <Code>+</Code> rail
            and <Code>-</Code> rail. <strong>Should not beep.</strong> If it
            does, find and fix the short before applying power.
          </CheckItem>
          <CheckItem id="build-psu-apply">
            Plug the PSU in. Multimeter on <Code>DC V</Code>: should read
            close to 5.0V across the rails. Strip should be dark (no firmware
            yet).
          </CheckItem>
          <CheckItem id="build-esp-usb">
            Connect ESP32 via USB-C to your computer. Its onboard LED should
            blink.
          </CheckItem>
        </ul>
      </Panel>

      {/* ── Firmware ─────────────────────────────────────────────────── */}
      <Panel>
        <H2 id="firmware">Firmware — ESPHome</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
          ESPHome is the fastest path to MQTT + WS2812 + OTA without writing
          C++. Later you can replace it with custom PlatformIO for richer
          effects.
        </p>

        <H3>1. Install ESPHome CLI</H3>
        <Pre>pip install esphome</Pre>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 12px" }}>
          Or use the ESPHome web dashboard if you prefer a GUI:
          <br />
          <Code>docker run --rm -p 6052:6052 -v ./esphome-data:/config -it esphome/esphome</Code>
        </p>

        <H3>2. Config file — <Code>misstep-storage-01.yaml</Code></H3>
        <Pre>{`esphome:
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
  broker: !secret mqtt_broker     # e.g. abc123.s1.eu.hivemq.cloud
  port: 8883
  username: !secret mqtt_username
  password: !secret mqtt_password
  topic_prefix: misstep/storage/misstep-storage-01

light:
  - platform: neopixelbus
    variant: WS2812
    pin: GPIO5
    num_leds: 432          # 3m × 144/m — adjust to your strip length
    rgb_order: GRB
    name: "Storage strip"
    id: storage_strip
    restore_mode: ALWAYS_OFF

binary_sensor:
  - platform: gpio
    pin:
      number: GPIO4        # pushbutton — tied to GND with internal pullup
      mode: INPUT_PULLUP
      inverted: true
    name: "Pull confirm"
    on_press:
      then:
        - mqtt.publish:
            topic: misstep/storage/misstep-storage-01/pull-complete
            payload: '{"deviceId":"misstep-storage-01"}'`}</Pre>

        <H3>3. Create a secrets file — <Code>secrets.yaml</Code></H3>
        <Pre>{`wifi_ssid: "YOUR_WIFI"
wifi_password: "..."
api_key: "32-char-base64-any-value"
ota_password: "pick-something"
mqtt_broker: "abc123.s1.eu.hivemq.cloud"
mqtt_username: "misstep-device"
mqtt_password: "..."`}</Pre>

        <H3>4. Flash the ESP32</H3>
        <Pre>{`# First flash (USB cable required)
esphome run misstep-storage-01.yaml

# Subsequent flashes go over the air once WiFi is up`}</Pre>
        <Note icon={<Cpu size={14} />}>
          If flashing fails with "Failed to connect", hold the{" "}
          <Code>BOOT</Code> button on the ESP32-S3 while plugging in USB, then
          retry.
        </Note>
      </Panel>

      {/* ── MQTT broker ──────────────────────────────────────────────── */}
      <Panel>
        <H2 id="mqtt">MQTT broker — HiveMQ Cloud free tier</H2>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="mqtt-signup">
            Sign up at <Code>console.hivemq.cloud</Code> — free tier, 100
            sessions, TLS, no card required.
          </CheckItem>
          <CheckItem id="mqtt-cluster">
            Create a <Code>Serverless Cluster</Code>. Region EU. Note the
            broker URL (looks like <Code>abc123.s1.eu.hivemq.cloud</Code>).
          </CheckItem>
          <CheckItem id="mqtt-creds-device">
            Add a user <Code>misstep-device</Code> with a strong password.
            Role: <strong>Publish and Subscribe</strong> on{" "}
            <Code>misstep/#</Code>.
          </CheckItem>
          <CheckItem id="mqtt-creds-dashboard">
            Add a second user <Code>misstep-dashboard</Code>, same permission
            scope. Keeps device and dashboard credentials separate so you can
            rotate one without breaking the other.
          </CheckItem>
          <CheckItem id="mqtt-test">
            From the HiveMQ web UI <Code>WebSocket Client</Code>: subscribe to{" "}
            <Code>misstep/#</Code>. Publish a test message to{" "}
            <Code>misstep/storage/test</Code>. You should see your own message
            come back.
          </CheckItem>
        </ul>
        <Note icon={<Wifi size={14} />}>
          ESP32-S3 only supports 2.4GHz WiFi. If your router broadcasts
          separate 2.4/5GHz SSIDs, pick the 2.4 one.
        </Note>
      </Panel>

      {/* ── First light ──────────────────────────────────────────────── */}
      <Panel>
        <H2 id="first-light">First light — hello world</H2>
        <ol
          style={{
            paddingLeft: 20,
            margin: 0,
            color: "var(--text-primary)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li>
            Device boots, connects to WiFi, connects to MQTT. Check HiveMQ
            dashboard &mdash; device should show up under{" "}
            <Code>Clients</Code>.
          </li>
          <li>
            Subscribe to <Code>misstep/storage/misstep-storage-01/#</Code> in
            the HiveMQ WebSocket Client to watch what the device publishes.
          </li>
          <li>
            Publish to <Code>misstep/storage/misstep-storage-01/light/command</Code>{" "}
            with payload:
            <Pre>{`{"state":"ON","color":{"r":0,"g":255,"b":0},"transition":0,"effect":"None"}`}</Pre>
            The whole strip should turn green. <strong>That&apos;s M1.</strong>
          </li>
          <li>
            Press the pushbutton. A message should appear on{" "}
            <Code>misstep/storage/misstep-storage-01/pull-complete</Code>.
          </li>
        </ol>
      </Panel>

      {/* ── Power injection ──────────────────────────────────────────── */}
      <Panel>
        <H2 id="power-injection">When the far end looks wrong</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
          At 144 LEDs/m on 5V, colors drift past ~1.5m at high brightness —
          pinks look orange, whites look pink. Two options:
        </p>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="inj-low-brightness">
            <strong>Just run lower brightness.</strong> For indicator use,
            you&apos;ll light 1-50 LEDs at a time at maybe 40% brightness —
            voltage drop never shows up. This is the MVP path.
          </CheckItem>
          <CheckItem id="inj-midpoint">
            <strong>Add power injection</strong> at the 1.5m and 3m points:
            solder fresh <Code>+5V</Code> and <Code>GND</Code> leads from the
            PSU trunk directly to the strip pads at those positions. Data
            continues uninterrupted. No firmware changes.
          </CheckItem>
        </ul>
      </Panel>

      {/* ── Troubleshooting ──────────────────────────────────────────── */}
      <Panel>
        <H2 id="trouble">Troubleshooting</H2>
        <H3>Strip stays dark</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-dark-power">
            Multimeter on <Code>DC V</Code> across strip&apos;s 5V/GND pads at
            the <em>input</em> end. Should read ~5V. If 0V, your pigtail or
            rail wiring is wrong.
          </CheckItem>
          <CheckItem id="ts-dark-data">
            Verify ESP32 GPIO5 → 74AHCT125 pin 2 → 330Ω → strip DIN, with no
            breaks. Re-seat jumpers on breadboard.
          </CheckItem>
          <CheckItem id="ts-dark-orientation">
            Strip arrow must point <em>away</em> from the end you soldered
            the leads to. If you wired the wrong end, desolder and move.
          </CheckItem>
        </ul>
        <H3>First LED lights, rest are wrong color / dead</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-timing">
            Almost always a data timing issue from skipping the level
            shifter. ESP32&apos;s 3.3V output works at short distances but
            fails at 144/m density or longer strips. Make sure 74AHCT125 is
            in-circuit and powered from 5V (pin 14).
          </CheckItem>
          <CheckItem id="ts-rgb-order">
            If red and green swap, the strip is BRG or GRB instead of the
            ESPHome default. Change <Code>rgb_order: GRB</Code> to match.
          </CheckItem>
        </ul>
        <H3>Device won&apos;t connect to MQTT</H3>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="ts-wifi-band">
            Confirm WiFi SSID is <strong>2.4GHz</strong>. Many routers
            broadcast a joint SSID that silently puts ESP32 on 5GHz →
            connection fails.
          </CheckItem>
          <CheckItem id="ts-tls">
            HiveMQ free tier is TLS-only on port <Code>8883</Code>. Make sure
            your YAML has <Code>port: 8883</Code> (not 1883).
          </CheckItem>
          <CheckItem id="ts-creds">
            Re-check MQTT username/password — copy-paste from HiveMQ, don&apos;t
            retype.
          </CheckItem>
        </ul>
      </Panel>

      {/* ── Dashboard next steps ─────────────────────────────────────── */}
      <Panel>
        <H2 id="next">Next — dashboard integration</H2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
          Once first light works, the dashboard side takes over:
        </p>
        <ul style={{ padding: 0, margin: 0 }}>
          <CheckItem id="next-devices-col">
            New <Code>dashboard_storage_devices</Code> collection —{" "}
            <Code>{`{ deviceId, label, scopes: [{ shelfRowId, boxId, boxRowIndex, ledOffset, ledCount, direction }] }`}</Code>
          </CheckItem>
          <CheckItem id="next-resolver">
            Slot → LED resolver — pure function mirroring the{" "}
            <Code>readingDirection</Code> logic in <Code>lib/storage.ts</Code>.
            Unit-tested.
          </CheckItem>
          <CheckItem id="next-api">
            <Code>POST /api/storage/light</Code> — takes{" "}
            <Code>{`{ slotKeys, mode, ttl }`}</Code>, resolves to device+LED
            addresses, publishes to MQTT.
          </CheckItem>
          <CheckItem id="next-calibration">
            Calibration UI in Storage tab — click a slot in the 3D render, LED
            lights, you enter the observed LED index as{" "}
            <Code>ledOffset</Code> for that scope.
          </CheckItem>
          <CheckItem id="next-find">
            &quot;Light slot&quot; button on Stock rows — white, 60s TTL.
          </CheckItem>
          <CheckItem id="next-pull">
            &quot;Pull order&quot; button on Cardmarket order detail — green
            mode, 5min TTL, button-press on device clears the session +
            decrements stock.
          </CheckItem>
        </ul>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "12px 0 0" }}>
          Once the MVP proves useful, consider a custom PCB for the cap (1 LED
          per slot using SK6805-1515) and Option C full-matrix switches (one
          per zone) via MCP23017 I²C expanders.
        </p>
      </Panel>

      <Note icon={<Lightbulb size={14} />}>
        Send me the parts photos when they land and we&apos;ll walk through
        the first solder joint together.
      </Note>

      <Note tone="info" icon={<Cable size={14} />}>
        This page lives at <Code>/system/storage-setup</Code> — bookmark it
        on your phone for bench reference.
      </Note>
    </div>
  );
}
